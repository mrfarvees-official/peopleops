import type { SessionUser } from "../domain/auth";
import { parseCsv, stringifyCsv } from "../domain/csv";
import {
  DataFormatError,
  ImportFailedError,
  PayloadTooLargeError,
  TableCapabilityError,
  UnknownTableError,
  fromWire,
  orderByDependencies,
  resolveScope,
  toWire,
  visibleColumns,
  type ImportReport,
  type Purpose,
  type RowError,
  type TableDef,
  type WireRow,
} from "../domain/tables";
import { createAudit } from "./audit-api";
import type { AuditWriter } from "./audit-writer";
import {
  RowRejected,
  type TableGateway,
  type TableTarget,
  type TableTx,
  type TenantFilter,
} from "./data-ports";
import type { Authorizer } from "./pbac";

export const LIMITS = {
  importBytes: 10 * 1024 * 1024,
  importRows: 20_000,
  exportRows: 200_000,
  page: 1000,
  maxRowErrors: 100,
} as const;

export type Format = "json" | "csv";

export interface DataLogger {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
  error(obj: object, msg: string): void;
}

export interface DataCtx {
  requestId?: string;
  ip?: string;
}

export interface DataDeps {
  gateway: TableGateway;
  authz: Authorizer;
  audit: AuditWriter;
  log: DataLogger;
  tables: TableDef[];
}

/** Thrown inside a transaction to roll it back after a successful dry run. */
class DryRunRollback extends Error {}

export function createDataTransfer({ gateway, authz, audit: writer, log, tables }: DataDeps) {
  const byKey = new Map(tables.map((t) => [t.key, t]));
  const targets = new Map<string, Promise<TableTarget>>();

  /** Looks the table up and reads its real columns (once). */
  function target(key: string): Promise<TableTarget> {
    const def = byKey.get(key);
    if (!def) return Promise.reject(new UnknownTableError(`Unknown table: ${key}`));
    let t = targets.get(key);
    if (!t) {
      t = gateway
        .describe(def.table)
        .then((meta) => ({ def, meta, scope: resolveScope(def, byKey) }));
      targets.set(key, t);
      t.catch(() => targets.delete(key));
    }
    return t;
  }

  const resourceOf = (user: SessionUser, def: TableDef, tenantId: string, id?: string) => ({
    type: def.resource,
    id,
    tenantId,
  });

  // Pipeline: PBAC first (done by the caller), then the work, then log the outcome.
  async function run<T>(
    action: string,
    user: SessionUser,
    ctx: DataCtx,
    fields: object,
    work: () => Promise<T>,
  ): Promise<T> {
    const base = {
      feature: "data-transfer",
      action,
      actorId: user.id,
      tenantId: user.tenantId,
      requestId: ctx.requestId,
      ...fields,
    };
    try {
      const result = await work();
      log.info({ ...base, outcome: "success" }, `data ${action}`);
      return result;
    } catch (e) {
      const name = (e as Error)?.name;
      if (name === "ForbiddenError") {
        log.warn({ ...base, outcome: "denied" }, `data ${action} denied`);
      } else if (
        ["UnknownTableError", "TableCapabilityError", "DataFormatError", "PayloadTooLargeError", "ImportFailedError", "CsvSyntaxError"].includes(name)
      ) {
        log.warn({ ...base, outcome: "failed", reason: (e as Error).message }, `data ${action} rejected`);
      } else {
        log.error({ ...base, outcome: "failed", err: e }, `data ${action} failed`);
      }
      throw e;
    }
  }

  /**
   * PBAC check for one table. Platform-wide tables, and platform-wide requests
   * ("all"), must be allowed for every tenant, so a tenant-bound role is
   * stopped by the cross-tenant deny policy.
   */
  async function authorizeTable(
    user: SessionUser,
    def: TableDef,
    action: string,
    tenantId: string | "all",
    ctx: DataCtx,
  ) {
    const ids =
      def.scope.kind === "global" || tenantId === "all"
        ? (await gateway.tenants()).map((t) => t.id)
        : [tenantId];
    if (ids.length === 0) ids.push(user.tenantId);
    for (const id of ids) await authz.assert(user, action, resourceOf(user, def, id), ctx);
  }

  /** Which rows a table request covers: platform-wide tables are never narrowed to a tenant. */
  const filterFor = (def: TableDef, tenantId: string | "all"): TenantFilter =>
    def.scope.kind === "global" || tenantId === "all" ? null : tenantId;

  /** The tenant a request is aimed at: the caller's own unless one is given. */
  const tenantFor = (user: SessionUser, requested?: string) => requested || user.tenantId;

  /** Rows -> wire format, reading every page. */
  async function readAll(
    t: TableTarget,
    tenant: TenantFilter,
    purpose: Purpose,
  ): Promise<{ columns: string[]; rows: WireRow[] }> {
    const cols = visibleColumns(t.def, t.meta, purpose);
    const names = cols.map((c) => c.name);
    const total = await gateway.count(t, tenant);
    if (total > LIMITS.exportRows) {
      throw new PayloadTooLargeError(
        `${t.def.label} has ${total} rows; the limit is ${LIMITS.exportRows}`,
      );
    }
    const rows: WireRow[] = [];
    for (let offset = 0; offset < total; offset += LIMITS.page) {
      const page = await gateway.read(t, tenant, names, LIMITS.page, offset);
      for (const r of page) {
        const out: WireRow = {};
        for (const c of cols) out[c.name] = toWire(r[c.name], c);
        rows.push(out);
      }
    }
    return { columns: names, rows };
  }

  /**
   * Converts and writes rows for one table inside an open transaction.
   * Problems are collected per row instead of stopping at the first one.
   */
  async function writeRows(
    tx: TableTx,
    t: TableTarget,
    rows: WireRow[],
    tenant: TenantFilter,
    purpose: Purpose,
    fromCsv: boolean,
  ): Promise<ImportReport> {
    const cols = new Map(visibleColumns(t.def, t.meta, purpose).map((c) => [c.name, c]));
    const report: ImportReport = {
      table: t.def.key,
      mode: "apply",
      total: rows.length,
      created: 0,
      updated: 0,
      errors: [],
      applied: false,
    };
    const fail = (row: number, message: string) => {
      if (report.errors.length < LIMITS.maxRowErrors) {
        report.errors.push({ table: t.def.key, row, message } satisfies RowError);
      }
    };

    for (const [i, raw] of rows.entries()) {
      const n = i + 1;
      try {
        const unknown = Object.keys(raw).filter((k) => !cols.has(k));
        if (unknown.length) throw new DataFormatError(`unknown column: ${unknown.join(", ")}`);
        const values: Record<string, unknown> = {};
        for (const c of cols.values()) {
          if (!(c.name in raw)) {
            if (!c.optional && !c.nullable) throw new DataFormatError(`${c.name}: a value is required`);
            continue; // leave to the database default
          }
          values[c.name] = fromWire(raw[c.name], c, fromCsv);
        }
        for (const k of t.meta.primaryKey) {
          if (values[k] === undefined || values[k] === null) {
            throw new DataFormatError(`${k}: the primary key is required`);
          }
        }
        const res = await tx.upsert(t, values, tenant);
        report[res] += 1;
      } catch (e) {
        const name = (e as Error)?.name;
        if (name === "DataFormatError" || name === "RowRejected") fail(n, (e as Error).message);
        else fail(n, `database refused the row: ${(e as Error).message.split("\n")[0].slice(0, 200)}`);
      }
    }
    return report;
  }

  return {
    byKey,
    target,
    tenantFor,
    readAll,
    writeRows,
    resourceOf,
    authorizeTable,
    filterFor,
    run,
    ordered: async (keys: string[]) =>
      orderByDependencies(await Promise.all(keys.map(target))),

    /**
     * What the caller may do with one table, from a single policy load. Cheap
     * enough to call on every list screen (the full list() checks every table).
     */
    async capabilities(user: SessionUser, key: string, ctx: DataCtx = {}) {
      const def = byKey.get(key);
      if (!def) return { canExport: false, canImport: false };
      const res = resourceOf(user, def, user.tenantId);
      const [exp, imp] = await authz.authorizeMany(
        user,
        [
          { action: "export", resource: res },
          { action: "import", resource: res },
        ],
        ctx,
      );
      return { canExport: def.export && exp.allowed, canImport: def.import && imp.allowed };
    },

    /** Tables the caller may export or import, with their columns. */
    async list(user: SessionUser, ctx: DataCtx = {}) {
      return run("list", user, ctx, {}, async () => {
        const out = [];
        for (const def of tables) {
          const [mayExport, mayImport] = await Promise.all([
            def.export ? authz.can(user, "export", resourceOf(user, def, user.tenantId), ctx) : false,
            def.import ? authz.can(user, "import", resourceOf(user, def, user.tenantId), ctx) : false,
          ]);
          if (!mayExport && !mayImport) continue;
          const t = await target(def.key);
          out.push({
            key: def.key,
            label: def.label,
            resource: def.resource,
            scope: def.scope.kind,
            canExport: mayExport,
            canImport: mayImport,
            formats: ["json", "csv"] as Format[],
            columns: visibleColumns(def, t.meta, "user").map((c) => ({
              name: c.name,
              type: c.type,
              required: !c.nullable && !c.optional,
              key: t.meta.primaryKey.includes(c.name),
            })),
          });
        }
        return out;
      });
    },

    async export(
      user: SessionUser,
      key: string,
      opts: { format?: Format; tenantId?: string },
      ctx: DataCtx = {},
    ) {
      const format = opts.format ?? "json";
      return run("export", user, ctx, { table: key, format }, async () => {
        const t = await target(key);
        if (!t.def.export) throw new TableCapabilityError(`${t.def.label} cannot be exported`);
        const tenantId = tenantFor(user, opts.tenantId);
        await authorizeTable(user, t.def, "export", tenantId, ctx);

        const { columns, rows } = await readAll(t, filterFor(t.def, tenantId), "user");
        await createAudit(writer, { tenantId, actorId: user.id, ...ctx }).transitioned(
          { type: t.def.resource },
          "export",
          {},
          { table: t.def.key, rows: rows.length, format },
        );

        const day = new Date().toISOString().slice(0, 10);
        return format === "csv"
          ? {
              filename: `${t.def.key}-${day}.csv`,
              contentType: "text/csv; charset=utf-8",
              body: stringifyCsv(columns, rows),
              rows: rows.length,
            }
          : {
              filename: `${t.def.key}-${day}.json`,
              contentType: "application/json; charset=utf-8",
              body: JSON.stringify(
                { format: "peopleops-table", version: 1, table: t.def.key, exportedAt: new Date().toISOString(), tenantId, rows },
                null,
                2,
              ),
              rows: rows.length,
            };
      });
    },

    async import(
      user: SessionUser,
      key: string,
      input: { body: string; format?: Format; mode?: "dry-run" | "apply"; tenantId?: string },
      ctx: DataCtx = {},
    ): Promise<ImportReport> {
      const format = input.format ?? "json";
      const mode = input.mode ?? "dry-run";
      return run("import", user, ctx, { table: key, format, mode }, async () => {
        const t = await target(key);
        if (!t.def.import) throw new TableCapabilityError(`${t.def.label} cannot be imported`);
        const tenantId = tenantFor(user, input.tenantId);
        await authorizeTable(user, t.def, "import", tenantId, ctx);

        if (input.body.length > LIMITS.importBytes) {
          throw new PayloadTooLargeError(`The file is larger than ${LIMITS.importBytes / 1024 / 1024} MB`);
        }
        const { rows, fromCsv } = parsePayload(input.body, format, t.def.key);
        if (rows.length > LIMITS.importRows) {
          throw new PayloadTooLargeError(`The file has ${rows.length} rows; the limit is ${LIMITS.importRows}`);
        }

        // One transaction: a dry run rolls it back, so the database itself
        // checks types, unique keys and foreign keys without keeping anything.
        let report!: ImportReport;
        try {
          await gateway.transaction(async (tx) => {
            report = await writeRows(tx, t, rows, filterFor(t.def, tenantId), "user", fromCsv);
            if (report.errors.length || mode === "dry-run") throw new DryRunRollback();
          });
          report.applied = true;
        } catch (e) {
          if (!(e instanceof DryRunRollback)) throw e;
        }
        report.mode = mode;

        if (mode === "apply" && report.errors.length) throw new ImportFailedError([report]);
        if (report.applied) {
          await createAudit(writer, { tenantId, actorId: user.id, ...ctx }).transitioned(
            { type: t.def.resource },
            "import",
            {},
            { table: t.def.key, created: report.created, updated: report.updated, total: report.total },
          );
        }
        return report;
      });
    },
  };
}

export type DataTransfer = ReturnType<typeof createDataTransfer>;

/** Reads an uploaded file into rows. JSON may be a bare array or an export envelope. */
function parsePayload(
  body: string,
  format: Format,
  key: string,
): { rows: WireRow[]; fromCsv: boolean } {
  if (format === "csv") {
    const { headers, rows } = parseCsv(body);
    return {
      fromCsv: true,
      rows: rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]]))),
    };
  }
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    throw new DataFormatError("The file is not valid JSON");
  }
  const rows = Array.isArray(data) ? data : (data as { rows?: unknown })?.rows;
  if (!Array.isArray(rows)) throw new DataFormatError('Expected a list of rows or an object with a "rows" list');
  if (!Array.isArray(data) && (data as { table?: string }).table && (data as { table?: string }).table !== key) {
    throw new DataFormatError(`This file is for "${(data as { table: string }).table}", not "${key}"`);
  }
  for (const r of rows) {
    if (r === null || typeof r !== "object" || Array.isArray(r)) {
      throw new DataFormatError("Every row must be an object");
    }
  }
  return { rows: rows as WireRow[], fromCsv: false };
}
