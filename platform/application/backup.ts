import { createHash, randomUUID } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import type { SessionUser } from "../domain/auth";
import {
  BackupCorruptError,
  BackupNotFoundError,
  ImportFailedError,
  type ImportReport,
  type WireRow,
} from "../domain/tables";
import { createAudit } from "./audit-api";
import type { AuditWriter } from "./audit-writer";
import type {
  BackupRecord,
  BackupRepository,
  BlobStore,
  TableGateway,
  TenantFilter,
} from "./data-ports";
import type { DataCtx, DataLogger, DataTransfer } from "./data-transfer";
import type { Authorizer } from "./pbac";

const FORMAT = "peopleops-backup";
const VERSION = 1;

interface Bundle {
  format: typeof FORMAT;
  version: number;
  createdAt: string;
  scope: { kind: "tenant" | "platform"; tenantId: string | null };
  tables: { key: string; table: string; columns: string[]; rows: WireRow[] }[];
}

export interface BackupDeps {
  gateway: TableGateway;
  transfer: DataTransfer;
  repo: BackupRepository;
  blobs: BlobStore;
  authz: Authorizer;
  audit: AuditWriter;
  log: DataLogger;
}

class RollbackAfterDryRun extends Error {}

export function createBackupService({
  gateway,
  transfer,
  repo,
  blobs,
  authz,
  audit: writer,
  log,
}: BackupDeps) {
  const target = (tenantId: string, id?: string) => ({ type: "backup", id, tenantId });
  const auditFor = (user: SessionUser, tenantId: string, ctx: DataCtx) =>
    createAudit(writer, { tenantId, actorId: user.id, ...ctx });

  /**
   * Which tenants a request touches. A platform-wide request touches every
   * tenant, so the caller must be allowed for each one (a tenant-bound role
   * is stopped by the cross-tenant deny policy).
   */
  async function authorizeScope(
    user: SessionUser,
    action: string,
    scope: { kind: "tenant" | "platform"; tenantId: string | null },
    ctx: DataCtx,
    id?: string,
  ) {
    if (scope.kind === "tenant") {
      await authz.assert(user, action, target(scope.tenantId ?? user.tenantId, id), ctx);
      return;
    }
    const tenants = await gateway.tenants();
    await authz.assert(user, action, target(user.tenantId, id), ctx);
    for (const t of tenants) await authz.assert(user, action, target(t.id, id), ctx);
  }

  const filterOf = (scope: { kind: "tenant" | "platform"; tenantId: string | null }): TenantFilter =>
    scope.kind === "platform" ? null : scope.tenantId;

  // Pipeline: PBAC first (inside the work), then the work, then log the outcome.
  async function run<T>(
    action: string,
    user: SessionUser,
    ctx: DataCtx,
    fields: object,
    work: () => Promise<T>,
  ): Promise<T> {
    const base = {
      feature: "backup",
      action,
      resourceType: "backup",
      actorId: user.id,
      tenantId: user.tenantId,
      requestId: ctx.requestId,
      ...fields,
    };
    try {
      const result = await work();
      log.info({ ...base, outcome: "success" }, `backup ${action}`);
      return result;
    } catch (e) {
      const name = (e as Error)?.name;
      if (name === "ForbiddenError") {
        log.warn({ ...base, outcome: "denied" }, `backup ${action} denied`);
      } else if (
        ["BackupNotFoundError", "BackupCorruptError", "ImportFailedError", "DataFormatError", "TableCapabilityError", "PayloadTooLargeError"].includes(name)
      ) {
        log.warn({ ...base, outcome: "failed", reason: (e as Error).message }, `backup ${action} rejected`);
      } else {
        log.error({ ...base, outcome: "failed", err: e }, `backup ${action} failed`);
      }
      throw e;
    }
  }

  /** Reads every backup-enabled table for the scope into a stored, compressed bundle. */
  async function createBundle(
    user: SessionUser,
    scope: { kind: "tenant" | "platform"; tenantId: string | null },
    kind: BackupRecord["kind"],
    note: string | null,
    ctx: DataCtx,
  ): Promise<BackupRecord> {
    // A tenant backup leaves out platform-wide tables; only a platform backup carries them.
    const defs = [...transfer.byKey.values()].filter(
      (d) => d.backup && (scope.kind === "platform" || d.scope.kind !== "global"),
    );
    const ordered = await transfer.ordered(defs.map((d) => d.key));

    // Reading a table needs the same right as exporting it.
    const who = scope.kind === "platform" ? "all" : (scope.tenantId ?? user.tenantId);
    for (const t of ordered) await transfer.authorizeTable(user, t.def, "export", who, ctx);

    const filter = filterOf(scope);
    const bundle: Bundle = {
      format: FORMAT,
      version: VERSION,
      createdAt: new Date().toISOString(),
      scope,
      tables: [],
    };
    for (const t of ordered) {
      const { columns, rows } = await transfer.readAll(t, filter, "backup");
      bundle.tables.push({ key: t.def.key, table: t.def.table, columns, rows });
    }

    const bytes = gzipSync(Buffer.from(JSON.stringify(bundle)));
    const id = randomUUID();
    const storageKey = `${id}.json.gz`;
    await blobs.put(storageKey, bytes);
    try {
      return await repo.insert({
        id,
        kind,
        scope: scope.kind,
        tenantId: scope.tenantId,
        status: "completed",
        storageKey,
        sizeBytes: bytes.length,
        checksum: createHash("sha256").update(bytes).digest("hex"),
        tables: bundle.tables.map((t) => ({ key: t.key, rows: t.rows.length })),
        note,
        createdBy: user.id,
      });
    } catch (e) {
      await blobs.remove(storageKey).catch(() => undefined); // do not leave an orphan file
      throw e;
    }
  }

  async function load(id: string): Promise<{ record: BackupRecord; bundle: Bundle }> {
    const record = await repo.get(id);
    if (!record) throw new BackupNotFoundError("Backup not found");
    const bytes = await blobs.get(record.storageKey);
    if (!bytes) throw new BackupCorruptError("The backup file is missing from storage");
    const sum = createHash("sha256").update(bytes).digest("hex");
    if (sum !== record.checksum) throw new BackupCorruptError("The backup file does not match its checksum");
    let bundle: Bundle;
    try {
      bundle = JSON.parse(gunzipSync(bytes).toString("utf8"));
    } catch {
      throw new BackupCorruptError("The backup file cannot be read");
    }
    if (bundle.format !== FORMAT || bundle.version !== VERSION) {
      throw new BackupCorruptError("Unsupported backup format");
    }
    return { record, bundle };
  }

  const scopeOf = (r: BackupRecord) => ({ kind: r.scope, tenantId: r.tenantId });

  return {
    async create(
      user: SessionUser,
      input: { scope?: "tenant" | "platform"; tenantId?: string; note?: string },
      ctx: DataCtx = {},
    ) {
      const scope = {
        kind: input.scope ?? "tenant",
        tenantId: input.scope === "platform" ? null : (input.tenantId || user.tenantId),
      } as const;
      return run("create", user, ctx, { scope: scope.kind }, async () => {
        await authorizeScope(user, "create", scope, ctx);
        const rec = await createBundle(user, scope, "manual", input.note?.slice(0, 255) || null, ctx);
        await auditFor(user, scope.tenantId ?? user.tenantId, ctx).created(
          { type: "backup", id: rec.id },
          { scope: rec.scope, tables: rec.tables.length, sizeBytes: rec.sizeBytes },
        );
        return rec;
      });
    },

    async list(user: SessionUser, ctx: DataCtx = {}) {
      return run("viewAny", user, ctx, {}, async () => {
        await authz.assert(user, "viewAny", target(user.tenantId), ctx);
        const tenants = await gateway.tenants();
        const visible: string[] = [];
        for (const t of tenants) {
          if (await authz.can(user, "viewAny", target(t.id), ctx)) visible.push(t.id);
        }
        return repo.list({ tenantIds: visible, includePlatform: visible.length === tenants.length });
      });
    },

    async get(user: SessionUser, id: string, ctx: DataCtx = {}) {
      return run("view", user, ctx, { resourceId: id }, async () => {
        const rec = await repo.get(id);
        if (!rec) throw new BackupNotFoundError("Backup not found");
        await authorizeScope(user, "view", scopeOf(rec), ctx, id);
        return rec;
      });
    },

    /** The stored file, for keeping a copy somewhere else. */
    async download(user: SessionUser, id: string, ctx: DataCtx = {}) {
      return run("export", user, ctx, { resourceId: id }, async () => {
        const rec = await repo.get(id);
        if (!rec) throw new BackupNotFoundError("Backup not found");
        await authorizeScope(user, "export", scopeOf(rec), ctx, id);
        const bytes = await blobs.get(rec.storageKey);
        if (!bytes) throw new BackupCorruptError("The backup file is missing from storage");
        await auditFor(user, rec.tenantId ?? user.tenantId, ctx).transitioned(
          { type: "backup", id },
          "export",
          {},
          { sizeBytes: rec.sizeBytes },
        );
        return {
          filename: `backup-${rec.createdAt.toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json.gz`,
          contentType: "application/gzip",
          bytes,
        };
      });
    },

    async remove(user: SessionUser, id: string, ctx: DataCtx = {}) {
      return run("delete", user, ctx, { resourceId: id }, async () => {
        const rec = await repo.get(id);
        if (!rec) throw new BackupNotFoundError("Backup not found");
        await authorizeScope(user, "delete", scopeOf(rec), ctx, id);
        await repo.remove(id);
        await blobs.remove(rec.storageKey).catch(() => undefined);
        await auditFor(user, rec.tenantId ?? user.tenantId, ctx).deleted(
          { type: "backup", id },
          { scope: rec.scope, tables: rec.tables.length },
        );
      });
    },

    /**
     * Puts a backup's rows back (insert missing rows, restore changed ones;
     * rows created since are left alone). A dry run reports what would happen
     * and writes nothing. An apply first takes a safety backup, then writes
     * every table in one transaction, so a failure leaves the data untouched.
     */
    async restore(
      user: SessionUser,
      id: string,
      input: { mode?: "dry-run" | "apply" } = {},
      ctx: DataCtx = {},
    ) {
      const mode = input.mode ?? "dry-run";
      return run("restore", user, ctx, { resourceId: id, mode }, async () => {
        const first = await repo.get(id);
        if (!first) throw new BackupNotFoundError("Backup not found");
        const scope = scopeOf(first);
        await authorizeScope(user, "restore", scope, ctx, id);

        const { record, bundle } = await load(id);
        const filter = filterOf(scope);

        // Resolve every table in the file; ones no longer registered are skipped.
        const skipped: string[] = [];
        const wanted = bundle.tables.filter((bt) => {
          const def = transfer.byKey.get(bt.key);
          if (!def || !def.backup || def.table !== bt.table) {
            skipped.push(bt.key);
            return false;
          }
          return true;
        });
        const ordered = await transfer.ordered(wanted.map((w) => w.key));
        const who = scope.kind === "platform" ? "all" : (scope.tenantId ?? user.tenantId);
        for (const t of ordered) await transfer.authorizeTable(user, t.def, "import", who, ctx);

        // Safety net: snapshot the current data before overwriting anything.
        let safety: BackupRecord | null = null;
        if (mode === "apply") {
          safety = await createBundle(user, scope, "pre_restore", `Before restoring ${id}`, ctx);
        }

        const reports: ImportReport[] = [];
        try {
          await gateway.transaction(async (tx) => {
            for (const t of ordered) {
              const data = wanted.find((w) => w.key === t.def.key)!;
              const rep = await transfer.writeRows(tx, t, data.rows, filter, "backup", false);
              rep.mode = mode;
              reports.push(rep);
            }
            if (mode === "dry-run" || reports.some((r) => r.errors.length)) throw new RollbackAfterDryRun();
          });
          reports.forEach((r) => (r.applied = true));
        } catch (e) {
          if (!(e instanceof RollbackAfterDryRun)) throw e;
        }

        if (mode === "apply" && reports.some((r) => r.errors.length)) {
          throw new ImportFailedError(reports);
        }
        if (mode === "apply") {
          await auditFor(user, scope.tenantId ?? user.tenantId, ctx).transitioned(
            { type: "backup", id },
            "restore",
            {},
            {
              tables: reports.length,
              created: reports.reduce((n, r) => n + r.created, 0),
              updated: reports.reduce((n, r) => n + r.updated, 0),
              safetyBackupId: safety?.id,
            },
          );
        }
        return {
          backupId: record.id,
          mode,
          applied: mode === "apply",
          safetyBackupId: safety?.id ?? null,
          skippedTables: skipped,
          tables: reports,
        };
      });
    },
  };
}

export type BackupService = ReturnType<typeof createBackupService>;
