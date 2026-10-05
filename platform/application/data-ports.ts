import type { ScopeNode, TableDef, TableMeta, WireRow } from "../domain/tables";

/** A table prepared for work: its catalogue entry, real columns and scope. */
export interface TableTarget {
  def: TableDef;
  meta: TableMeta;
  scope: ScopeNode;
}

/** Which rows are in play: one tenant, or everything (null) for platform-wide work. */
export type TenantFilter = string | null;

/** A write that was refused or failed for one row. */
export class RowRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RowRejected";
  }
}

export interface TableTx {
  /**
   * Insert the row, or update it if its primary key exists. Rejects (RowRejected)
   * rows that fall outside the tenant, including an existing row that belongs
   * to someone else. Values are already converted for the database.
   */
  upsert(
    target: TableTarget,
    row: Record<string, unknown>,
    tenant: TenantFilter,
  ): Promise<"created" | "updated">;
}

export interface TableGateway {
  /** Real columns, primary key and foreign keys. Throws if the table does not exist. */
  describe(table: string): Promise<TableMeta>;
  count(target: TableTarget, tenant: TenantFilter): Promise<number>;
  /** One page of rows as JSON-safe values, ordered by primary key. */
  read(
    target: TableTarget,
    tenant: TenantFilter,
    columns: string[],
    limit: number,
    offset: number,
  ): Promise<WireRow[]>;
  /** Everything inside runs in one database transaction; any throw rolls it back. */
  transaction<T>(fn: (tx: TableTx) => Promise<T>): Promise<T>;
  /** Active tenants, used to check that a platform-wide request is allowed for every one. */
  tenants(): Promise<{ id: string; name: string }[]>;
}

// ---------------------------------------------------------------- backups

export interface BackupRecord {
  id: string;
  kind: "manual" | "pre_restore";
  scope: "tenant" | "platform";
  tenantId: string | null;
  status: "completed";
  storageKey: string;
  sizeBytes: number;
  checksum: string;
  tables: { key: string; rows: number }[];
  note: string | null;
  createdBy: string | null;
  createdAt: Date;
}

export interface BackupRepository {
  insert(r: Omit<BackupRecord, "createdAt">): Promise<BackupRecord>;
  get(id: string): Promise<BackupRecord | null>;
  /** Newest first. Platform-wide backups only when includePlatform. */
  list(q: { tenantIds: string[]; includePlatform: boolean }): Promise<BackupRecord[]>;
  remove(id: string): Promise<void>;
}

export interface BlobStore {
  put(key: string, bytes: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  remove(key: string): Promise<void>;
}
