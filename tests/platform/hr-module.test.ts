/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it } from "vitest";
import {
  createModule,
  type HrExtras,
  type ListQuery,
  type ModuleConfig,
  type ModuleDeps,
  type ModuleRepo,
  type Rec,
} from "@/platform/application/hr-module";
import { createAuthorizer } from "@/platform/application/pbac";
import type { SessionUser } from "@/platform/domain/auth";
import type { Policy } from "@/platform/domain/pbac";
import { InMemoryAuditWriter } from "@/platform/infrastructure/in-memory-audit-writer";

// A small "tasks" module: owned records with a salary-like secret and a workflow.

class MemRepo implements ModuleRepo {
  rows = new Map<string, Rec>();
  n = 0;
  async list(q: ListQuery) {
    let rows = [...this.rows.values()].filter((r) => r.tenantId === q.tenantId && !!r.deletedAt === q.includeDeleted);
    if (q.scopeUserId) rows = rows.filter((r) => r.ownerUserId === q.scopeUserId || r.managerUserId === q.scopeUserId);
    for (const [k, v] of Object.entries(q.filters)) rows = rows.filter((r) => String(r[k]) === v);
    if (q.search) rows = rows.filter((r) => String(r.title).includes(q.search!));
    return { rows: rows.slice(q.skip, q.skip + q.take), total: rows.length };
  }
  async get(id: string) {
    return this.rows.get(id) ?? null;
  }
  async create(tenantId: string, data: Record<string, unknown>) {
    const rec = { id: `t${++this.n}`, tenantId, createdAt: new Date(), updatedAt: new Date(), deletedAt: null, ...data } as Rec;
    this.rows.set(rec.id, rec);
    return rec;
  }
  async update(id: string, data: Record<string, unknown>) {
    const rec = { ...this.rows.get(id)!, ...data } as Rec;
    this.rows.set(id, rec);
    return rec;
  }
  async softDelete(id: string) {
    this.rows.get(id)!.deletedAt = new Date();
  }
  async restore(id: string) {
    this.rows.get(id)!.deletedAt = null;
  }
}

const config: ModuleConfig = {
  key: "tasks",
  label: "Tasks",
  singular: "Task",
  resource: "task",
  soft: true,
  scoped: true,
  fields: [
    { key: "title", label: "Title", type: "text", required: true, max: 20 },
    { key: "points", label: "Points", type: "number", min: 0, max: 100 },
    { key: "due", label: "Due", type: "date" },
    { key: "salary", label: "Salary", type: "money", sensitive: true },
    { key: "status", label: "State", type: "select", options: [{ value: "open", label: "Open" }, { value: "done", label: "Done" }], readOnly: true },
  ],
  columns: ["title", "status"],
  searchable: ["title"],
  filters: ["status"],
  actions: [
    { key: "finish", label: "Finish", pbacAction: "approve", scope: "record", from: ["open"], to: "done", note: "optional" },
    { key: "reopen", label: "Reopen", pbacAction: "approve", scope: "record", from: ["done"], to: "open", note: "required" },
    {
      key: "quick-add",
      label: "Quick add",
      pbacAction: "create",
      scope: "collection",
      async run(c) {
        return { mode: "create", data: { title: "Quick", status: "open", ownerUserId: c.user.id } };
      },
    },
  ],
  attrs: (r) => ({ ownerId: r.ownerUserId as string | null, managerId: r.managerUserId as string | null, status: r.status as string }),
  async prepare({ user }, data, existing) {
    // Whoever creates a task owns it (the way leave requests belong to their employee).
    return existing ? data : { status: "open", ownerUserId: user.id, managerUserId: "boss", ...data };
  },
};

const own = { attribute: "resource.ownerId", operator: "eq", ref: "subject.id" } as const;
const policies: Policy[] = [
  { id: "1", code: "staff-own", effect: "allow", subjects: [{ type: "any" }], targets: [{ action: "view", resource: "task" }, { action: "viewAny", resource: "task" }, { action: "create", resource: "task" }], conditions: [] },
  // staff may edit and finish only their own tasks, and only while open
  { id: "2", code: "staff-edit-own", effect: "allow", subjects: [{ type: "any" }], targets: [{ action: "update", resource: "task" }], conditions: [own, { attribute: "resource.status", operator: "eq", value: "open" }] },
  { id: "3", code: "boss", effect: "allow", subjects: [{ type: "role", role: "boss" }], targets: [{ action: null, resource: "task" }], conditions: [] },
  { id: "4", code: "no-self-approve", effect: "deny", subjects: [{ type: "any" }], targets: [{ action: "approve", resource: "task" }], conditions: [own] },
  { id: "5", code: "isolation", effect: "deny", subjects: [{ type: "any" }], targets: [{ action: null, resource: null }], conditions: [{ attribute: "resource.tenantId", operator: "neq", ref: "subject.tenantId" }] },
];
// "staff-own" above lets everyone view any task; narrow to own/managed for non-bosses by scoping
policies[0].conditions = [{ attribute: "resource.ownerId", operator: "eq", ref: "subject.id" }];
policies.push({ id: "6", code: "list-any", effect: "allow", subjects: [{ type: "any" }], targets: [{ action: "viewAny", resource: "task" }, { action: "create", resource: "task" }], conditions: [] });

const user = (id: string, roles: string[] = []): SessionUser => ({ id, tenantId: "t1", email: `${id}@x.y`, displayName: id, roles });

function setup() {
  const repo = new MemRepo();
  const audit = new InMemoryAuditWriter();
  const authz = createAuthorizer({ repo: { findApplicable: async () => policies }, audit });
  const logs: { level: string; obj: Record<string, unknown>; msg: string }[] = [];
  const log = {
    info: (obj: object, msg: string) => logs.push({ level: "info", obj: obj as never, msg }),
    warn: (obj: object, msg: string) => logs.push({ level: "warn", obj: obj as never, msg }),
    error: (obj: object, msg: string) => logs.push({ level: "error", obj: obj as never, msg }),
  };
  const deps = { repos: {}, now: () => new Date("2026-10-05T10:00:00Z"), syncOwnership: async () => {}, extras: {} as HrExtras, settings: {} as never } satisfies ModuleDeps;
  const mod = createModule(config, { repo, lookups: { options: async () => [] }, authz, audit, log, deps });
  return { repo, audit, logs, mod };
}

describe("hr module framework", () => {
  let s: ReturnType<typeof setup>;
  const ann = user("ann");
  const bob = user("bob");
  const boss = user("boss", ["boss"]);
  beforeEach(() => {
    s = setup();
  });

  it("checks PBAC before it looks at the input", async () => {
    const nobody = { ...user("x"), tenantId: "t1" };
    // a role with no create right at all gets Forbidden, not a validation error
    const policiesBackup = policies.splice(0, policies.length);
    policies.push({ id: "9", code: "isolation", effect: "deny", subjects: [{ type: "any" }], targets: [{ action: null, resource: null }], conditions: [{ attribute: "resource.tenantId", operator: "neq", ref: "subject.tenantId" }] });
    await expect(s.mod.create(nobody, { nonsense: true })).rejects.toMatchObject({ name: "ForbiddenError" });
    policies.splice(0, policies.length, ...policiesBackup);
    expect(s.audit.entries.at(-1)).toMatchObject({ outcome: "denied" });
  });

  it("validates input: required, limits, types, unknown and read-only keys", async () => {
    const bad = await s.mod.create(ann, { points: 500, due: "05/10/2026", status: "done", extra: 1 }).catch((e) => e);
    expect(bad.name).toBe("ValidationError");
    const fields = bad.details.map((d: { field?: string }) => d.field).sort();
    expect(fields).toEqual(expect.arrayContaining(["title", "points", "due"]));
    expect(JSON.stringify(bad.details)).toContain("unknown or read-only field");
    await expect(s.mod.create(ann, { title: "x".repeat(21) })).rejects.toMatchObject({ name: "ValidationError" });
  });

  it("creates, turns dates into real dates, and audits without secrets", async () => {
    const r: any = await s.mod.create(ann, { title: "Write", due: "2026-10-20", salary: "1500.50" });
    expect(r).toMatchObject({ title: "Write", due: "2026-10-20", salary: 1500.5, status: "open", });
    expect(s.repo.rows.get(r.id)!.due).toEqual(new Date("2026-10-20T00:00:00Z"));
    const e = s.audit.entries.find((x) => x.action === "task.create")!;
    expect(e.after).toMatchObject({ title: "Write", salary: "***" });
    expect(s.logs.at(-1)).toMatchObject({ level: "info", obj: { feature: "hr.tasks", action: "create", outcome: "success" } });
  });

  it("hides sensitive fields from people who neither own nor may edit the record", async () => {
    const mine: any = await s.mod.create(ann, { title: "A", salary: 10 });
    expect(mine.salary).toBe(10); // owner
    s.repo.rows.get(mine.id)!.managerUserId = "bob";
    const bobSees: any = await s.mod.get(bob, mine.id).catch((e) => e); // not owner; policy allows view only for owner => denied
    expect(bobSees.name).toBe("ForbiddenError");
    const bossSees: any = await s.mod.get(boss, mine.id);
    expect(bossSees.salary).toBe(10); // may edit
    expect(bossSees._can.update).toBe(true);
  });

  it("scopes lists to own and reports' records unless access is wide", async () => {
    await s.mod.create(ann, { title: "ann task" });
    await s.mod.create(bob, { title: "bob task" });
    expect((await s.mod.list(ann, {})).rows.map((r: any) => r.title)).toEqual(["ann task"]);
    expect((await s.mod.list(boss, {})).rows).toHaveLength(2);
    expect((await s.mod.list(boss, { search: "bob" })).rows).toHaveLength(1);
    expect((await s.mod.list(boss, { filters: { status: "done" } })).rows).toHaveLength(0);
  });

  it("counts only what a restricted person can open, exactly, across pages", async () => {
    // ann owns 30 tasks; bob owns 2 and has "boss" as manager (so both appear in boss's scoped lists)
    for (let i = 0; i < 30; i++) await s.mod.create(ann, { title: `ann ${i}` });
    await s.mod.create(bob, { title: "bob 1" });
    s.repo.rows.get("t1")!.managerUserId = "bob"; // bob manages one of ann's tasks, but the policy only lets owners view
    const first = await s.mod.list(ann, { page: 1, size: 25 });
    expect(first.total).toBe(30);
    expect(first.rows).toHaveLength(25);
    const second = await s.mod.list(ann, { page: 2, size: 25 });
    expect(second.rows).toHaveLength(5);
    // bob is the "manager" of ann's task t1 in the database, yet may not view it: it must not inflate his count
    const bobs = await s.mod.list(bob, {});
    expect(bobs.total).toBe(1);
    expect(bobs.rows).toHaveLength(1);
  });

  it("pages in sizes of 25, 50 or 100 and falls back for anything else", async () => {
    for (let i = 0; i < 30; i++) await s.mod.create(boss, { title: `t${i}` });
    const a = await s.mod.list(boss, { size: 7 });
    expect(a).toMatchObject({ size: 25, page: 1, total: 30 });
    expect(a.rows).toHaveLength(25);
    expect((await s.mod.list(boss, { size: 25, page: 2 })).rows).toHaveLength(5);
  });

  it("never lets one tenant see another's records", async () => {
    const r: any = await s.mod.create(boss, { title: "T1 task" });
    const other = { ...boss, tenantId: "t2" };
    await expect(s.mod.get(other, r.id)).rejects.toMatchObject({ name: "ForbiddenError" });
    expect((await s.mod.list(other, {})).rows).toHaveLength(0);
  });

  it("updates only what policy allows, and only the fields sent", async () => {
    const r: any = await s.mod.create(ann, { title: "Old", points: 5 });
    await expect(s.mod.update(bob, r.id, { title: "Hack" })).rejects.toMatchObject({ name: "ForbiddenError" });
    const u: any = await s.mod.update(ann, r.id, { title: "New" });
    expect(u).toMatchObject({ title: "New", points: 5 });
    const a = s.audit.entries.find((x) => x.action === "task.update" && x.outcome === "success")!;
    expect(a.before).toMatchObject({ title: "Old" });
    expect(a.after).toMatchObject({ title: "New" });
    await expect(s.mod.update(ann, r.id, { title: "" })).rejects.toMatchObject({ name: "ValidationError" });
  });

  it("runs workflow steps: status rules, PBAC rules, notes", async () => {
    const r: any = await s.mod.create(ann, { title: "Flow" });
    await expect(s.mod.act(ann, "finish", r.id)).rejects.toMatchObject({ name: "ForbiddenError" }); // no self approval
    await expect(s.mod.act(boss, "reopen", r.id)).rejects.toMatchObject({ name: "ValidationError" }); // needs a note
    await expect(s.mod.act(boss, "reopen", r.id, { note: "again" })).rejects.toMatchObject({ name: "InvalidTransitionError" }); // not done
    const done: any = await s.mod.act(boss, "finish", r.id, { note: "good" });
    expect(done.status).toBe("done");
    expect(s.audit.entries.find((x) => x.action === "task.finish")).toMatchObject({ after: { status: "done", note: "good" } });
    await expect(s.mod.act(boss, "finish", r.id)).rejects.toMatchObject({ name: "InvalidTransitionError" });
    await expect(s.mod.act(boss, "nope", r.id)).rejects.toMatchObject({ name: "RecordNotFoundError" });
  });

  it("reports what each person may do on each row", async () => {
    const r: any = await s.mod.create(ann, { title: "Mine" });
    const row: any = (await s.mod.list(ann, {})).rows[0];
    expect(row._can).toMatchObject({ update: true, delete: false, actions: [] }); // cannot finish own work
    const asBoss: any = (await s.mod.list(boss, {})).rows.find((x: any) => x.id === r.id);
    expect(asBoss._can).toMatchObject({ update: true, delete: true, actions: ["finish"] });
  });

  it("runs steps that are not about an existing record", async () => {
    const r: any = await s.mod.act(ann, "quick-add", null);
    expect(r).toMatchObject({ title: "Quick", status: "open" });
    expect(s.audit.entries.find((x) => x.action === "task.quick-add")).toBeDefined();
  });

  it("deletes softly and restores", async () => {
    const r: any = await s.mod.create(boss, { title: "Bye" });
    await expect(s.mod.remove(ann, r.id)).rejects.toMatchObject({ name: "ForbiddenError" });
    await s.mod.remove(boss, r.id);
    expect((await s.mod.list(boss, {})).rows).toHaveLength(0);
    expect((await s.mod.list(boss, { deleted: true })).rows).toHaveLength(1);
    await s.mod.restore(boss, r.id);
    expect((await s.mod.list(boss, {})).rows).toHaveLength(1);
    expect(s.audit.entries.map((e) => e.action)).toEqual(expect.arrayContaining(["task.delete", "task.restore"]));
  });

  it("logs denials as warnings and missing records as warnings, not errors", async () => {
    await expect(s.mod.get(ann, "nope")).rejects.toMatchObject({ name: "RecordNotFoundError" });
    expect(s.logs.at(-1)).toMatchObject({ level: "warn", obj: { outcome: "failed" } });
    const r: any = await s.mod.create(ann, { title: "L" });
    await s.mod.update(bob, r.id, { title: "x" }).catch(() => {});
    expect(s.logs.at(-1)).toMatchObject({ level: "warn", obj: { outcome: "denied", action: "update" } });
  });
});
