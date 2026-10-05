/**
 * Table-level model for the generic import / export / backup / restore engine.
 *
 * The engine works on any registered table. Column types come from the database
 * itself (see ColumnMeta); the catalogue (platform/domain/table-catalogue.ts)
 * only says which tables take part and how they are scoped and protected.
 */

export type ColumnType =
  | "int"
  | "bigint"
  | "decimal"
  | "float"
  | "boolean"
  | "text"
  | "datetime"
  | "date"
  | "time"
  | "json"
  | "enum";

export interface ColumnMeta {
  name: string;
  type: ColumnType;
  nullable: boolean;
  /** Has a default, is auto-generated, or may be omitted on insert. */
  optional: boolean;
}

export interface TableMeta {
  name: string;
  columns: ColumnMeta[];
  primaryKey: string[];
  /** Tables this one points at through foreign keys. */
  references: string[];
}

/** How a table's rows belong to a tenant. */
export type TableScope =
  | { kind: "tenant"; column: string } // the row carries the tenant id ("id" for the tenant table itself)
  | { kind: "via"; column: string; parent: string; parentColumn: string } // belongs to a row of another registered table
  | { kind: "global" }; // platform-wide data (catalogues, settings)

export interface TableDef {
  /** URL-safe name used in the API, e.g. "policies". */
  key: string;
  /** Real table name. */
  table: string;
  label: string;
  /** PBAC resource type that guards the data, e.g. "policy". */
  resource: string;
  scope: TableScope;
  /** Secrets: never in user exports or imports, but kept in backups so a restore is complete. */
  hidden?: string[];
  export: boolean;
  import: boolean;
  /** Included in backups and put back by a restore. */
  backup: boolean;
}

/** Resolved form of TableScope with parents followed, ready for the database layer. */
export type ScopeNode =
  | { kind: "global" }
  | { kind: "tenant"; column: string }
  | { kind: "via"; column: string; parentTable: string; parentColumn: string; parent: ScopeNode };

export function resolveScope(def: TableDef, byKey: Map<string, TableDef>): ScopeNode {
  const walk = (d: TableDef, depth: number): ScopeNode => {
    if (depth > 8) throw new Error(`Scope of "${d.key}" is too deep or circular`);
    const s = d.scope;
    if (s.kind === "global") return { kind: "global" };
    if (s.kind === "tenant") return { kind: "tenant", column: s.column };
    const parent = byKey.get(s.parent);
    if (!parent) throw new Error(`Table "${d.key}" is scoped through unknown table "${s.parent}"`);
    return {
      kind: "via",
      column: s.column,
      parentTable: parent.table,
      parentColumn: s.parentColumn,
      parent: walk(parent, depth + 1),
    };
  };
  return walk(def, 0);
}

/** Parents first, so rows can be inserted without breaking foreign keys. */
export function orderByDependencies<T extends { def: TableDef; meta: TableMeta }>(
  items: T[],
): T[] {
  const byTable = new Map(items.map((i) => [i.def.table, i]));
  const done = new Set<string>();
  const out: T[] = [];
  const visit = (i: T, trail: string[]) => {
    if (done.has(i.def.table)) return;
    if (trail.includes(i.def.table)) return; // self or circular reference: keep input order
    for (const ref of i.meta.references) {
      const parent = byTable.get(ref);
      if (parent && parent !== i) visit(parent, [...trail, i.def.table]);
    }
    done.add(i.def.table);
    out.push(i);
  };
  for (const i of items) visit(i, []);
  return out;
}

export type Purpose = "user" | "backup";

/** Columns that may leave (or enter) the system for the given purpose. */
export function visibleColumns(def: TableDef, meta: TableMeta, purpose: Purpose): ColumnMeta[] {
  if (purpose === "backup") return meta.columns;
  const hidden = new Set(def.hidden ?? []);
  return meta.columns.filter((c) => !hidden.has(c.name));
}

export type WireRow = Record<string, unknown>;

// ---------------------------------------------------------------- errors

function named(name: string) {
  return class extends Error {
    constructor(message: string) {
      super(message);
      this.name = name;
    }
  };
}

export const UnknownTableError = named("UnknownTableError");
export const TableCapabilityError = named("TableCapabilityError");
export const DataFormatError = named("DataFormatError");
export const PayloadTooLargeError = named("PayloadTooLargeError");
export const BackupNotFoundError = named("BackupNotFoundError");
export const BackupCorruptError = named("BackupCorruptError");

export interface RowError {
  table: string;
  /** 1-based position in the uploaded file; 0 when not tied to a row. */
  row: number;
  message: string;
}

export interface ImportReport {
  table: string;
  mode: "dry-run" | "apply";
  total: number;
  created: number;
  updated: number;
  errors: RowError[];
  applied: boolean;
}

/** Thrown when an import or restore found problems; nothing was written. */
export class ImportFailedError extends Error {
  constructor(readonly reports: ImportReport[]) {
    super("Import failed: nothing was written");
    this.name = "ImportFailedError";
  }
}

// ---------------------------------------------------------- value mapping

const isoLike = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

/** Database value -> JSON-safe value. */
export function toWire(value: unknown, col: ColumnMeta): unknown {
  if (value === null || value === undefined) return null;
  switch (col.type) {
    case "datetime":
    case "date":
      return value instanceof Date ? value.toISOString() : String(value);
    case "bigint":
      return typeof value === "bigint" ? value.toString() : String(value);
    case "boolean":
      return value === true || value === 1 || value === "1" || value === BigInt(1);
    case "json":
      if (typeof value === "string") {
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      }
      return value;
    case "int":
    case "float":
      return Number(value);
    case "decimal":
      return String(value);
    default:
      return typeof value === "bigint" ? value.toString() : value;
  }
}

/**
 * JSON-safe or CSV text value -> value the database layer can bind.
 * `fromCsv` means every non-null input is a string.
 */
export function fromWire(value: unknown, col: ColumnMeta, fromCsv = false): unknown {
  const bad = (why: string) => new DataFormatError(`${col.name}: ${why}`);

  if (fromCsv && value === "") value = null; // empty cell = no value
  if (value === null || value === undefined) {
    if (!col.nullable && !col.optional) throw bad("a value is required");
    return null;
  }

  switch (col.type) {
    case "int": {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isInteger(n)) throw bad("expected a whole number");
      return n;
    }
    case "bigint": {
      try {
        return BigInt(value as string | number);
      } catch {
        throw bad("expected a whole number");
      }
    }
    case "float": {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) throw bad("expected a number");
      return n;
    }
    case "decimal": {
      const s = String(value).trim();
      if (!/^-?\d+(\.\d+)?$/.test(s)) throw bad("expected a decimal number");
      return s;
    }
    case "boolean": {
      if (value === true || value === 1 || value === "1" || value === "true") return 1;
      if (value === false || value === 0 || value === "0" || value === "false") return 0;
      throw bad("expected true or false");
    }
    case "datetime":
    case "date": {
      const s = String(value);
      if (!isoLike.test(s)) throw bad("expected an ISO date such as 2026-10-05T10:00:00Z");
      const d = new Date(s.includes("T") || s.includes(" ") ? s : `${s}T00:00:00Z`);
      if (isNaN(d.getTime())) throw bad("not a valid date");
      return d;
    }
    case "json": {
      if (fromCsv && typeof value === "string") {
        try {
          return JSON.stringify(JSON.parse(value));
        } catch {
          throw bad("expected valid JSON");
        }
      }
      return JSON.stringify(value);
    }
    default: {
      if (typeof value === "object") throw bad("expected text");
      return String(value);
    }
  }
}
