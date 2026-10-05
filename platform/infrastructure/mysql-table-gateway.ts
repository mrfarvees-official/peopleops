import type { PrismaClient } from "../../prisma/app/generated/prisma/client";
import {
  RowRejected,
  type TableGateway,
  type TableTarget,
  type TableTx,
  type TenantFilter,
} from "../application/data-ports";
import type { ColumnMeta, ColumnType, ScopeNode, TableMeta, WireRow } from "../domain/tables";

/** Anything that can run raw SQL: the client itself or an open transaction. */
interface Sql {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
}

// Table and column names come from the catalogue and information_schema, never
// from request input, but every identifier is checked before it reaches SQL.
const ident = (name: string) => {
  if (!/^[A-Za-z0-9_]+$/.test(name)) throw new Error(`Unsafe identifier: ${name}`);
  return `\`${name}\``;
};

const TEXT = new Set(["char", "varchar", "tinytext", "text", "mediumtext", "longtext", "time", "enum", "set"]);

function columnType(dataType: string, columnType: string): ColumnType {
  const t = dataType.toLowerCase();
  if (t === "tinyint" && /^tinyint\(1\)/i.test(columnType)) return "boolean";
  if (["tinyint", "smallint", "mediumint", "int", "integer", "year"].includes(t)) return "int";
  if (t === "bigint") return "bigint";
  if (t === "decimal" || t === "numeric") return "decimal";
  if (t === "float" || t === "double") return "float";
  if (t === "datetime" || t === "timestamp") return "datetime";
  if (t === "date") return "date";
  if (t === "json") return "json";
  if (TEXT.has(t)) return t === "enum" || t === "set" ? "enum" : "text";
  throw new Error(`Column type "${dataType}" is not supported by import/export`);
}

/** WHERE fragment (and its parameters) that keeps only one tenant's rows. */
function scopeSql(node: ScopeNode, tenant: TenantFilter): { sql: string; params: unknown[] } {
  if (tenant === null || node.kind === "global") return { sql: "1=1", params: [] };
  if (node.kind === "tenant") return { sql: `${ident(node.column)} = ?`, params: [tenant] };
  const inner = scopeSql(node.parent, tenant);
  return {
    sql: `${ident(node.column)} IN (SELECT ${ident(node.parentColumn)} FROM ${ident(node.parentTable)} WHERE ${inner.sql})`,
    params: inner.params,
  };
}

const pkWhere = (t: TableTarget) => t.meta.primaryKey.map((c) => `${ident(c)} = ?`).join(" AND ");

class MysqlTx implements TableTx {
  constructor(private readonly sql: Sql) {}

  async upsert(t: TableTarget, row: Record<string, unknown>, tenant: TenantFilter) {
    const known = new Set(t.meta.columns.map((c) => c.name));
    const cols = Object.keys(row).filter((c) => known.has(c));
    const table = ident(t.meta.name);
    const key = t.meta.primaryKey.map((c) => row[c]);

    const found = await this.sql.$queryRawUnsafe<unknown[]>(
      `SELECT 1 AS x FROM ${table} WHERE ${pkWhere(t)} LIMIT 1`,
      ...key,
    );
    const exists = found.length > 0;

    if (tenant !== null) {
      await this.assertRowInScope(t.scope, row, tenant);
      if (exists) {
        const sc = scopeSql(t.scope, tenant);
        const mine = await this.sql.$queryRawUnsafe<unknown[]>(
          `SELECT 1 AS x FROM ${table} WHERE ${pkWhere(t)} AND ${sc.sql} LIMIT 1`,
          ...key,
          ...sc.params,
        );
        if (mine.length === 0) throw new RowRejected("this record belongs to another company");
      }
    }

    if (exists) {
      const set = cols.filter((c) => !t.meta.primaryKey.includes(c));
      if (set.length) {
        await this.sql.$executeRawUnsafe(
          `UPDATE ${table} SET ${set.map((c) => `${ident(c)} = ?`).join(", ")} WHERE ${pkWhere(t)}`,
          ...set.map((c) => row[c]),
          ...key,
        );
      }
      return "updated" as const;
    }
    // Plain INSERT (not ON DUPLICATE KEY) so a clash on another unique key is
    // reported as an error instead of silently overwriting a different row.
    await this.sql.$executeRawUnsafe(
      `INSERT INTO ${table} (${cols.map(ident).join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
      ...cols.map((c) => row[c]),
    );
    return "created" as const;
  }

  /** The row must claim the tenant (or hang off a parent row that is the tenant's). */
  private async assertRowInScope(node: ScopeNode, row: Record<string, unknown>, tenant: string) {
    if (node.kind === "global") return;
    if (node.kind === "tenant") {
      if (String(row[node.column] ?? "") !== tenant) {
        throw new RowRejected(`${node.column} must be your own company`);
      }
      return;
    }
    const parent = scopeSql(node.parent, tenant);
    const ok = await this.sql.$queryRawUnsafe<unknown[]>(
      `SELECT 1 AS x FROM ${ident(node.parentTable)} WHERE ${ident(node.parentColumn)} = ? AND ${parent.sql} LIMIT 1`,
      row[node.column],
      ...parent.params,
    );
    if (ok.length === 0) throw new RowRejected(`${node.column} points at a record outside your company`);
  }
}

export class MysqlTableGateway implements TableGateway {
  private readonly cache = new Map<string, TableMeta>();

  constructor(private readonly db: PrismaClient) {}

  async describe(table: string): Promise<TableMeta> {
    const hit = this.cache.get(table);
    if (hit) return hit;

    const [cols, pk, fks] = await Promise.all([
      this.db.$queryRawUnsafe<
        { name: string; dataType: string; columnType: string; nullable: string; dflt: unknown; extra: string }[]
      >(
        `SELECT COLUMN_NAME AS name, DATA_TYPE AS dataType, COLUMN_TYPE AS columnType,
                IS_NULLABLE AS nullable, COLUMN_DEFAULT AS dflt, EXTRA AS extra
           FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
          ORDER BY ORDINAL_POSITION`,
        table,
      ),
      this.db.$queryRawUnsafe<{ name: string }[]>(
        `SELECT COLUMN_NAME AS name FROM information_schema.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = 'PRIMARY'
          ORDER BY SEQ_IN_INDEX`,
        table,
      ),
      this.db.$queryRawUnsafe<{ ref: string }[]>(
        `SELECT DISTINCT REFERENCED_TABLE_NAME AS ref FROM information_schema.KEY_COLUMN_USAGE
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL`,
        table,
      ),
    ]);
    if (cols.length === 0) throw new Error(`Table "${table}" does not exist`);
    if (pk.length === 0) throw new Error(`Table "${table}" has no primary key`);

    const columns: ColumnMeta[] = cols
      .filter((c) => !/GENERATED/i.test(c.extra ?? "")) // computed by the database
      .map((c) => ({
        name: c.name,
        type: columnType(c.dataType, c.columnType),
        nullable: c.nullable === "YES",
        optional:
          c.nullable === "YES" || c.dflt !== null || /auto_increment|DEFAULT_GENERATED/i.test(c.extra ?? ""),
      }));
    const meta: TableMeta = {
      name: table,
      columns,
      primaryKey: pk.map((p) => p.name),
      references: fks.map((f) => f.ref),
    };
    this.cache.set(table, meta);
    return meta;
  }

  async count(t: TableTarget, tenant: TenantFilter) {
    const sc = scopeSql(t.scope, tenant);
    const r = await this.db.$queryRawUnsafe<{ n: bigint | number }[]>(
      `SELECT COUNT(*) AS n FROM ${ident(t.meta.name)} WHERE ${sc.sql}`,
      ...sc.params,
    );
    return Number(r[0]?.n ?? 0);
  }

  async read(t: TableTarget, tenant: TenantFilter, columns: string[], limit: number, offset: number) {
    if (!Number.isSafeInteger(limit) || !Number.isSafeInteger(offset) || limit < 0 || offset < 0) {
      throw new Error("Bad paging values");
    }
    const sc = scopeSql(t.scope, tenant);
    return this.db.$queryRawUnsafe<WireRow[]>(
      `SELECT ${columns.map(ident).join(", ")} FROM ${ident(t.meta.name)}
        WHERE ${sc.sql} ORDER BY ${t.meta.primaryKey.map(ident).join(", ")}
        LIMIT ${limit} OFFSET ${offset}`,
      ...sc.params,
    );
  }

  transaction<T>(fn: (tx: TableTx) => Promise<T>): Promise<T> {
    return this.db.$transaction(async (tx) => fn(new MysqlTx(tx as unknown as Sql)), {
      timeout: 120_000,
      maxWait: 10_000,
    });
  }

  async tenants() {
    return this.db.tenant.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });
  }
}
