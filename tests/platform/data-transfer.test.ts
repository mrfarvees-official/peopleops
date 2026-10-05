import { beforeEach, describe, expect, it } from "vitest";
import { createBackupService } from "@/platform/application/backup";
import {
  RowRejected,
  type BackupRecord,
  type BackupRepository,
  type BlobStore,
  type TableGateway,
  type TableTarget,
  type TableTx,
  type TenantFilter,
} from "@/platform/application/data-ports";
import { createDataTransfer } from "@/platform/application/data-transfer";
import { createAuthorizer } from "@/platform/application/pbac";
import type { SessionUser } from "@/platform/domain/auth";
import type { Policy } from "@/platform/domain/pbac";
import type { ColumnMeta, TableDef, TableMeta, WireRow } from "@/platform/domain/tables";
import { InMemoryAuditWriter } from "@/platform/infrastructure/in-memory-audit-writer";

// ── a tiny database with real rollback ─────────────────────────────────────

type Store = Map<string, Map<string, Record<string, unknown>>>;

const c = (name: string, type: ColumnMeta["type"], o: Partial<ColumnMeta> = {}): ColumnMeta => ({
  name, type, nullable: false, optional: false, ...o,
});

const METAS: Record<string, TableMeta> = {
  t_item: {
    name: "t_item",
    primaryKey: ["id"],
    references: [],
    columns: [c("id", "text"), c("tenantId", "text"), c("name", "text"), c("secret", "text", { optional: true }), c("qty", "int", { optional: true })],
  },
  t_part: {
    name: "t_part",
    primaryKey: ["id"],
    references: ["t_item"],
    columns: [c("id", "text"), c("itemId", "text"), c("label", "text")],
  },
  t_cat: {
    name: "t_cat",
    primaryKey: ["id"],
    references: [],
    columns: [c("id", "text"), c("title", "text")],
  },
};

const DEFS: TableDef[] = [
  { key: "items", table: "t_item", label: "Items", resource: "item", scope: { kind: "tenant", column: "tenantId" }, hidden: ["secret"], export: true, import: true, backup: true },
  { key: "parts", table: "t_part", label: "Parts", resource: "item", scope: { kind: "via", column: "itemId", parent: "items", parentColumn: "id" }, export: true, import: true, backup: true },
  { key: "cats", table: "t_cat", label: "Categories", resource: "catalogue", scope: { kind: "global" }, export: true, import: true, backup: true },
  { key: "locked", table: "t_item", label: "Locked", resource: "item", scope: { kind: "tenant", column: "tenantId" }, export: true, import: false, backup: false },
];

class FakeGateway implements TableGateway {
  data: Store = new Map(Object.keys(METAS).map((t) => [t, new Map()]));
  tenantList = [{ id: "t1", name: "One" }, { id: "t2", name: "Two" }];

  describe = async (table: string) => METAS[table];
  tenants = async () => this.tenantList;

  private inScope(t: TableTarget, row: Record<string, unknown>, tenant: TenantFilter): boolean {
    const walk = (node: TableTarget["scope"], r: Record<string, unknown>): boolean => {
      if (tenant === null || node.kind === "global") return true;
      if (node.kind === "tenant") return r[node.column] === tenant;
      const parent = [...this.data.get(node.parentTable)!.values()].find((p) => p[node.parentColumn] === r[node.column]);
      return !!parent && walk(node.parent, parent);
    };
    return walk(t.scope, row);
  }

  rows(t: TableTarget, tenant: TenantFilter) {
    return [...this.data.get(t.meta.name)!.values()].filter((r) => this.inScope(t, r, tenant));
  }
  count = async (t: TableTarget, tenant: TenantFilter) => this.rows(t, tenant).length;
  read = async (t: TableTarget, tenant: TenantFilter, columns: string[], limit: number, offset: number) =>
    this.rows(t, tenant).slice(offset, offset + limit).map((r) => Object.fromEntries(columns.map((k) => [k, r[k] ?? null])) as WireRow);

  async transaction<T>(fn: (tx: TableTx) => Promise<T>): Promise<T> {
    const snapshot: Store = new Map([...this.data].map(([k, v]) => [k, new Map([...v].map(([id, r]) => [id, { ...r }]))]));
    const tx: TableTx = {
      upsert: async (t, row, tenant) => {
        const table = this.data.get(t.meta.name)!;
        const id = String(row.id);
        const existing = table.get(id);
        if (tenant !== null) {
          if (!this.inScope(t, row, tenant)) throw new RowRejected("outside your company");
          if (existing && !this.inScope(t, existing, tenant)) throw new RowRejected("this record belongs to another company");
        }
        table.set(id, { ...(existing ?? {}), ...row });
        return existing ? "updated" : "created";
      },
    };
    try {
      return await fn(tx);
    } catch (e) {
      this.data = snapshot; // rollback
      throw e;
    }
  }
}

class MemBlobs implements BlobStore {
  files = new Map<string, Uint8Array>();
  put = async (k: string, b: Uint8Array) => void this.files.set(k, b);
  get = async (k: string) => this.files.get(k) ?? null;
  remove = async (k: string) => void this.files.delete(k);
}

class MemBackups implements BackupRepository {
  rows: BackupRecord[] = [];
  insert = async (r: Omit<BackupRecord, "createdAt">) => {
    const rec = { ...r, createdAt: new Date() };
    this.rows.unshift(rec);
    return rec;
  };
  get = async (id: string) => this.rows.find((r) => r.id === id) ?? null;
  list = async (q: { tenantIds: string[]; includePlatform: boolean }) =>
    this.rows.filter((r) => (r.scope === "tenant" ? q.tenantIds.includes(r.tenantId!) : q.includePlatform));
  remove = async (id: string) => void (this.rows = this.rows.filter((r) => r.id !== id));
}

// ── PBAC: admins may do everything; tenants are isolated ───────────────────

// "root" is like super_admin: allowed everywhere and exempt from tenant isolation.
// "admin" can do everything, but only inside its own tenant.
const policies: Policy[] = [
  { id: "0", code: "root", effect: "allow", subjects: [{ type: "role", role: "root" }], targets: [{ action: null, resource: null }], conditions: [] },
  { id: "1", code: "admin", effect: "allow", subjects: [{ type: "role", role: "admin" }], targets: [{ action: null, resource: null }], conditions: [] },
  { id: "2", code: "manager-items", effect: "allow", subjects: [{ type: "role", role: "manager" }], targets: [{ action: "export", resource: "item" }, { action: "import", resource: "item" }], conditions: [] },
  { id: "3", code: "isolation", effect: "deny", subjects: [{ type: "role", role: "admin" }, { type: "role", role: "manager" }, { type: "role", role: "employee" }], targets: [{ action: null, resource: null }], conditions: [{ attribute: "resource.tenantId", operator: "neq", ref: "subject.tenantId" }] },
];

const user = (roles: string[], tenantId = "t1"): SessionUser => ({ id: "u1", tenantId, email: "a@b.c", displayName: "A", roles });
const admin = user(["admin"]);
const root = user(["root"]);
const manager = user(["manager"]);
const nobody = user(["employee"]);

function setup() {
  const gateway = new FakeGateway();
  const audit = new InMemoryAuditWriter();
  const authz = createAuthorizer({ repo: { findApplicable: async () => policies }, audit });
  const logs: string[] = [];
  const log = { info: (_: object, m: string) => logs.push(m), warn: (_: object, m: string) => logs.push(m), error: (_: object, m: string) => logs.push(m) };
  const transfer = createDataTransfer({ gateway, authz, audit, log, tables: DEFS });
  const blobs = new MemBlobs();
  const repo = new MemBackups();
  const backups = createBackupService({ gateway, transfer, repo, blobs, authz, audit, log });
  const item = (id: string, tenantId: string, extra: Record<string, unknown> = {}) =>
    gateway.data.get("t_item")!.set(id, { id, tenantId, name: `name-${id}`, secret: "s3", qty: 1, ...extra });
  return { gateway, audit, transfer, backups, blobs, repo, logs, item };
}

describe("export", () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
    s.item("a", "t1");
    s.item("b", "t2");
  });

  it("returns only the tenant's rows and never the hidden columns", async () => {
    const f = await s.transfer.export(admin, "items", {});
    const body = JSON.parse(f.body);
    expect(body.rows.map((r: { id: string }) => r.id)).toEqual(["a"]);
    expect(f.body).not.toContain("secret");
    expect(f.contentType).toContain("json");
  });

  it("writes CSV with a header row", async () => {
    const f = await s.transfer.export(admin, "items", { format: "csv" });
    expect(f.body.split("\r\n")[0]).toBe("id,tenantId,name,qty");
    expect(f.filename).toMatch(/^items-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it("is checked by PBAC, audited, and logged", async () => {
    await expect(s.transfer.export(nobody, "items", {})).rejects.toMatchObject({ name: "ForbiddenError" });
    await s.transfer.export(admin, "items", {});
    expect(s.audit.entries.find((e) => e.action === "item.export" && e.outcome === "success")).toMatchObject({ outcome: "success", after: { table: "items", rows: 1 } });
    expect(s.logs).toContain("data export");
  });

  it("will not read another company's rows without permission", async () => {
    await expect(s.transfer.export(manager, "items", { tenantId: "t2" })).rejects.toMatchObject({ name: "ForbiddenError" });
  });

  it("platform-wide tables need rights over every tenant", async () => {
    await expect(s.transfer.export(manager, "cats", {})).rejects.toMatchObject({ name: "ForbiddenError" });
    await expect(s.transfer.export(admin, "cats", {})).rejects.toMatchObject({ name: "ForbiddenError" });
    await expect(s.transfer.export(root, "cats", {})).resolves.toBeDefined();
  });

  it("rejects unknown tables and tables that cannot be exported this way", async () => {
    await expect(s.transfer.export(admin, "nope", {})).rejects.toMatchObject({ name: "UnknownTableError" });
    await expect(s.transfer.import(admin, "locked", { body: "[]" })).rejects.toMatchObject({ name: "TableCapabilityError" });
  });
});

describe("capabilities", () => {
  it("tells a list screen which buttons to draw, from the policies", async () => {
    const s = setup();
    expect(await s.transfer.capabilities(admin, "items")).toEqual({ canExport: true, canImport: true });
    expect(await s.transfer.capabilities(manager, "items")).toEqual({ canExport: true, canImport: true });
    expect(await s.transfer.capabilities(nobody, "items")).toEqual({ canExport: false, canImport: false });
    // the table itself may rule a button out, whatever the policies say
    expect(await s.transfer.capabilities(admin, "locked")).toEqual({ canExport: true, canImport: false });
    expect(await s.transfer.capabilities(admin, "nope")).toEqual({ canExport: false, canImport: false });
  });
});

describe("import", () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
    s.item("a", "t1");
  });
  const file = (rows: object[]) => JSON.stringify({ table: "items", rows });

  it("dry run reports and keeps nothing", async () => {
    const r = await s.transfer.import(admin, "items", {
      body: file([{ id: "a", tenantId: "t1", name: "renamed" }, { id: "n", tenantId: "t1", name: "new" }]),
    });
    expect(r).toMatchObject({ mode: "dry-run", total: 2, created: 1, updated: 1, errors: [], applied: false });
    expect(s.gateway.data.get("t_item")!.get("a")!.name).toBe("name-a");
    expect(s.gateway.data.get("t_item")!.has("n")).toBe(false);
  });

  it("apply writes the rows and audits the import", async () => {
    const r = await s.transfer.import(admin, "items", {
      mode: "apply",
      body: file([{ id: "a", tenantId: "t1", name: "renamed" }, { id: "n", tenantId: "t1", name: "new" }]),
    });
    expect(r).toMatchObject({ applied: true, created: 1, updated: 1 });
    expect(s.gateway.data.get("t_item")!.get("a")!.name).toBe("renamed");
    expect(s.gateway.data.get("t_item")!.get("a")!.secret).toBe("s3"); // untouched hidden column
    expect(s.audit.entries.find((e) => e.action === "item.import")).toMatchObject({ after: { created: 1, updated: 1 } });
  });

  it("apply is all or nothing: one bad row stops everything", async () => {
    const err = await s.transfer
      .import(admin, "items", {
        mode: "apply",
        body: file([{ id: "n", tenantId: "t1", name: "fine" }, { id: "bad", tenantId: "t1" }]),
      })
      .catch((e) => e);
    expect(err.name).toBe("ImportFailedError");
    expect(err.reports[0].errors).toEqual([{ table: "items", row: 2, message: "name: a value is required" }]);
    expect(s.gateway.data.get("t_item")!.has("n")).toBe(false);
  });

  it("refuses rows for another company and never overwrites one", async () => {
    s.item("b", "t2");
    const r = await s.transfer.import(admin, "items", {
      body: file([{ id: "x", tenantId: "t2", name: "sneaky" }, { id: "b", tenantId: "t1", name: "steal" }]),
    });
    expect(r.errors.map((e) => e.message)).toEqual([
      "outside your company",
      "this record belongs to another company",
    ]);
    expect(s.gateway.data.get("t_item")!.get("b")!.tenantId).toBe("t2");
  });

  it("checks child rows against their parent's company", async () => {
    s.item("b", "t2");
    const r = await s.transfer.import(admin, "parts", {
      body: JSON.stringify([{ id: "p1", itemId: "a", label: "ok" }, { id: "p2", itemId: "b", label: "foreign parent" }]),
    });
    expect(r.created).toBe(1);
    expect(r.errors).toEqual([{ table: "parts", row: 2, message: "outside your company" }]);
  });

  it("rejects hidden or unknown columns and bad values with the row number", async () => {
    const r = await s.transfer.import(admin, "items", {
      body: file([{ id: "n", tenantId: "t1", name: "x", secret: "leak" }, { id: "m", tenantId: "t1", name: "x", qty: "many" }]),
    });
    expect(r.errors.map((e) => `${e.row}:${e.message}`)).toEqual([
      "1:unknown column: secret",
      "2:qty: expected a whole number",
    ]);
  });

  it("reads CSV, with empty cells as no value", async () => {
    const r = await s.transfer.import(admin, "items", {
      format: "csv",
      mode: "apply",
      body: "id,tenantId,name,qty\r\nc1,t1,From CSV,\r\n",
    });
    expect(r.created).toBe(1);
    expect(s.gateway.data.get("t_item")!.get("c1")).toMatchObject({ name: "From CSV", qty: null });
  });

  it("enforces size limits and file shape", async () => {
    await expect(s.transfer.import(admin, "items", { body: "not json" })).rejects.toMatchObject({ name: "DataFormatError" });
    await expect(s.transfer.import(admin, "items", { body: '{"table":"cats","rows":[]}' })).rejects.toMatchObject({ name: "DataFormatError" });
    await expect(s.transfer.import(admin, "items", { body: "[1]" })).rejects.toMatchObject({ name: "DataFormatError" });
    await expect(s.transfer.import(admin, "items", { body: "x".repeat(10 * 1024 * 1024 + 1) })).rejects.toMatchObject({ name: "PayloadTooLargeError" });
  });

  it("is checked by PBAC before anything is parsed", async () => {
    await expect(s.transfer.import(nobody, "items", { body: "garbage" })).rejects.toMatchObject({ name: "ForbiddenError" });
    expect(s.audit.entries.at(-1)).toMatchObject({ outcome: "denied" });
  });
});

describe("backup and restore", () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
    s.item("a", "t1");
    s.item("b", "t2");
    s.gateway.data.get("t_part")!.set("p1", { id: "p1", itemId: "a", label: "part" });
    s.gateway.data.get("t_cat")!.set("c1", { id: "c1", title: "cat" });
  });

  it("a tenant backup holds that tenant's tables, with secrets, and no platform-wide ones", async () => {
    const b = await s.backups.create(admin, { note: "n" });
    expect(b).toMatchObject({ kind: "manual", scope: "tenant", tenantId: "t1" });
    expect(b.tables).toEqual([{ key: "items", rows: 1 }, { key: "parts", rows: 1 }]);
    expect(s.blobs.files.size).toBe(1);
    expect(s.audit.entries.find((e) => e.action === "backup.create")).toBeDefined();
  });

  it("a platform backup holds everything that is backup-enabled", async () => {
    const b = await s.backups.create(root, { scope: "platform" });
    expect(b.tables.map((t) => t.key).sort()).toEqual(["cats", "items", "parts"]);
    expect(b.tables.find((t) => t.key === "items")!.rows).toBe(2);
  });

  it("restore dry run changes nothing; apply reverts edits and takes a safety backup", async () => {
    const b = await s.backups.create(admin, {});
    s.gateway.data.get("t_item")!.get("a")!.name = "edited later";
    s.gateway.data.get("t_item")!.set("z", { id: "z", tenantId: "t1", name: "added later" });

    const dry = await s.backups.restore(admin, b.id, {});
    expect(dry).toMatchObject({ mode: "dry-run", applied: false, safetyBackupId: null });
    expect(s.gateway.data.get("t_item")!.get("a")!.name).toBe("edited later");

    const done = await s.backups.restore(admin, b.id, { mode: "apply" });
    expect(done.applied).toBe(true);
    expect(done.safetyBackupId).toBeTruthy();
    expect(s.gateway.data.get("t_item")!.get("a")!.name).toBe("name-a"); // put back
    expect(s.gateway.data.get("t_item")!.has("z")).toBe(true); // rows made since are kept
    expect(s.gateway.data.get("t_item")!.get("a")!.secret).toBe("s3");
    expect(s.repo.rows.find((r) => r.id === done.safetyBackupId)).toMatchObject({ kind: "pre_restore" });
    expect(s.audit.entries.find((e) => e.action === "backup.restore")).toBeDefined();
  });

  it("a tenant restore never touches other companies", async () => {
    const b = await s.backups.create(admin, {});
    s.gateway.data.get("t_item")!.get("b")!.name = "other company edit";
    await s.backups.restore(admin, b.id, { mode: "apply" });
    expect(s.gateway.data.get("t_item")!.get("b")!.name).toBe("other company edit");
  });

  it("restore is all or nothing", async () => {
    const b = await s.backups.create(admin, {});
    s.gateway.data.get("t_item")!.get("a")!.name = "edited later";
    // Corrupt one table in the stored bundle so the second table fails.
    const { gzipSync, gunzipSync } = await import("node:zlib");
    const { createHash } = await import("node:crypto");
    const rec = s.repo.rows[0];
    const bundle = JSON.parse(gunzipSync(s.blobs.files.get(rec.storageKey)!).toString());
    bundle.tables.find((t: { key: string }) => t.key === "parts").rows[0].label = null;
    const bytes = gzipSync(Buffer.from(JSON.stringify(bundle)));
    s.blobs.files.set(rec.storageKey, bytes);
    rec.checksum = createHash("sha256").update(bytes).digest("hex");

    const err = await s.backups.restore(admin, b.id, { mode: "apply" }).catch((e) => e);
    expect(err.name).toBe("ImportFailedError");
    expect(s.gateway.data.get("t_item")!.get("a")!.name).toBe("edited later"); // first table rolled back too
  });

  it("detects a changed or missing file", async () => {
    const b = await s.backups.create(admin, {});
    s.blobs.files.set(s.repo.rows[0].storageKey, new Uint8Array([1, 2, 3]));
    await expect(s.backups.restore(admin, b.id, {})).rejects.toMatchObject({ name: "BackupCorruptError" });
    s.blobs.files.clear();
    await expect(s.backups.download(admin, b.id)).rejects.toMatchObject({ name: "BackupCorruptError" });
  });

  it("downloads, lists and deletes (with the file)", async () => {
    const b = await s.backups.create(admin, {});
    const f = await s.backups.download(admin, b.id);
    expect(f.contentType).toBe("application/gzip");
    expect(f.bytes.length).toBeGreaterThan(10);
    expect((await s.backups.list(admin)).map((x) => x.id)).toEqual([b.id]);
    await s.backups.remove(admin, b.id);
    expect(s.repo.rows).toHaveLength(0);
    expect(s.blobs.files.size).toBe(0);
    await expect(s.backups.get(admin, b.id)).rejects.toMatchObject({ name: "BackupNotFoundError" });
  });

  it("is guarded by PBAC at every step", async () => {
    await expect(s.backups.create(nobody, {})).rejects.toMatchObject({ name: "ForbiddenError" });
    await expect(s.backups.list(nobody)).rejects.toMatchObject({ name: "ForbiddenError" });
    // a manager can read items but has no right to create backups
    await expect(s.backups.create(manager, {})).rejects.toMatchObject({ name: "ForbiddenError" });
    // a platform-wide backup needs rights over every tenant
    await expect(s.backups.create(manager, { scope: "platform" })).rejects.toMatchObject({ name: "ForbiddenError" });
    await expect(s.backups.create(admin, { scope: "platform" })).rejects.toMatchObject({ name: "ForbiddenError" });
    const b = await s.backups.create(admin, {});
    await expect(s.backups.restore(nobody, b.id, { mode: "apply" })).rejects.toMatchObject({ name: "ForbiddenError" });
    await expect(s.backups.download(nobody, b.id)).rejects.toMatchObject({ name: "ForbiddenError" });
    await expect(s.backups.remove(nobody, b.id)).rejects.toMatchObject({ name: "ForbiddenError" });
  });
});
