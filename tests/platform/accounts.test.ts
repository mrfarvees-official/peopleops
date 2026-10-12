import { describe, expect, it } from "vitest";
import { createAccountService } from "@/platform/application/accounts";
import type {
  AccountRepository,
  SignupRepository,
} from "@/platform/application/accounts-ports";
import { createSignupService } from "@/platform/application/signup";
import { slugify, type AccountView } from "@/platform/domain/accounts";
import type { SessionUser } from "@/platform/domain/auth";
import { ForbiddenError } from "@/platform/domain/pbac";
import { InMemoryAuditWriter } from "@/platform/infrastructure/in-memory-audit-writer";

const T = "t1";
const admin: SessionUser = {
  id: "admin",
  tenantId: T,
  email: "admin@x.com",
  displayName: "Admin",
  roles: ["hr_admin"],
};

function account(over: Partial<AccountView> & { id: string }): AccountView {
  return {
    tenantId: T,
    email: `${over.id}@x.com`,
    displayName: over.id,
    status: "active",
    roles: ["employee"],
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...over,
  };
}

function setup(allowed: string[] = ["viewAny", "view", "create", "update", "delete", "restore"]) {
  const rows = new Map<string, AccountView>([
    ["admin", account({ id: "admin", roles: ["hr_admin"] })],
    ["bob", account({ id: "bob" })],
  ]);
  const revoked: string[] = [];
  const repo: AccountRepository = {
    list: async (t, o) =>
      [...rows.values()].filter((r) => r.tenantId === t && (o.includeRemoved || !r.deletedAt)),
    get: async (t, id) => (rows.get(id)?.tenantId === t ? rows.get(id)! : null),
    findByEmail: async (t, e) => {
      const r = [...rows.values()].find((x) => x.tenantId === t && x.email === e);
      return r ? { id: r.id, removed: !!r.deletedAt } : null;
    },
    knownRoles: async (c) => c.filter((x) => x !== "ghost"),
    create: async (t, a) => {
      const v = account({ id: `n${rows.size}`, tenantId: t, ...a });
      rows.set(v.id, v);
      return v;
    },
    update: async (_t, id, p, ver) => {
      const r = rows.get(id)!;
      if (ver && ver !== r.version) return null;
      const v = { ...r, ...stripUndefined(p), version: r.version + 1 };
      rows.set(id, v);
      return v;
    },
    remove: async (_t, id) => {
      rows.set(id, { ...rows.get(id)!, deletedAt: new Date() });
    },
    restore: async (_t, id) => {
      const v = { ...rows.get(id)!, deletedAt: null };
      rows.set(id, v);
      return v;
    },
    revokeSessions: async (id) => {
      revoked.push(id);
    },
    countActiveWithRole: async (t, role, except) =>
      [...rows.values()].filter(
        (r) =>
          r.tenantId === t && r.id !== except && !r.deletedAt && r.status === "active" && r.roles.includes(role),
      ).length,
  };
  const audit = new InMemoryAuditWriter();
  const logs: { level: string; obj: Record<string, unknown> }[] = [];
  const log = {
    info: (obj: object) => logs.push({ level: "info", obj: obj as Record<string, unknown> }),
    warn: (obj: object) => logs.push({ level: "warn", obj: obj as Record<string, unknown> }),
    error: (obj: object) => logs.push({ level: "error", obj: obj as Record<string, unknown> }),
  };
  const checked: string[] = [];
  const authz = {
    assert: async (_u: SessionUser, action: string) => {
      checked.push(action);
      if (!allowed.includes(action)) {
        throw new ForbiddenError({ allowed: false, reason: "no_matching_policy", matched: [] });
      }
      return { allowed: true, reason: "allowed", matched: [] };
    },
  } as never;
  const svc = createAccountService({
    repo,
    authz,
    audit,
    log,
    hasher: { hash: async (p) => `h:${p}`, verify: async () => true },
  });
  return { svc, rows, audit, logs, revoked, checked };
}

const stripUndefined = <O extends object>(o: O) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

const good = { email: "New@X.com", displayName: "New", password: "longpassword1", roles: ["employee"] };

describe("accounts: PBAC first, then act, then log", () => {
  it("creates an account, hashes the password, audits and logs it", async () => {
    const { svc, rows, audit, logs, checked } = setup();
    const a = await svc.create(admin, good);
    expect(checked[0]).toBe("create");
    expect(a.email).toBe("new@x.com");
    expect(rows.get(a.id)).toBeTruthy();
    expect(audit.entries[0]).toMatchObject({ action: "user.create", tenantId: T });
    expect(JSON.stringify(audit.entries)).not.toContain("longpassword1");
    expect(logs.at(-1)).toMatchObject({
      level: "info",
      obj: { feature: "accounts", action: "create", outcome: "success", actorId: "admin" },
    });
  });

  it("refuses create before reading the input when denied", async () => {
    const { svc, logs, rows } = setup([]);
    await expect(svc.create(admin, { nonsense: true })).rejects.toThrow(ForbiddenError);
    expect(rows.size).toBe(2);
    expect(logs.at(-1)).toMatchObject({ level: "warn", obj: { outcome: "denied", action: "create" } });
  });

  it("denies every other action when PBAC says no", async () => {
    const { svc, rows } = setup([]);
    await expect(svc.list(admin)).rejects.toThrow(ForbiddenError);
    await expect(svc.get(admin, "bob")).rejects.toThrow(ForbiddenError);
    await expect(svc.update(admin, "bob", { displayName: "X" })).rejects.toThrow(ForbiddenError);
    await expect(svc.remove(admin, "bob")).rejects.toThrow(ForbiddenError);
    await expect(svc.restore(admin, "bob")).rejects.toThrow(ForbiddenError);
    expect(rows.get("bob")!.displayName).toBe("bob");
    expect(rows.get("bob")!.deletedAt).toBeNull();
  });

  it("lists, hiding removed accounts unless asked", async () => {
    const { svc } = setup();
    await svc.remove(admin, "bob");
    expect((await svc.list(admin)).map((a) => a.id)).toEqual(["admin"]);
    expect((await svc.list(admin, { includeRemoved: true })).length).toBe(2);
  });
});

describe("accounts: rules", () => {
  it("rejects a duplicate email, and points at a removed one", async () => {
    const { svc } = setup();
    await expect(svc.create(admin, { ...good, email: "bob@x.com" })).rejects.toThrow(/already exists/);
    await svc.remove(admin, "bob");
    await expect(svc.create(admin, { ...good, email: "bob@x.com" })).rejects.toThrow(/Restore it/);
  });

  it("never hands out platform roles or unknown roles", async () => {
    const { svc } = setup();
    await expect(svc.create(admin, { ...good, roles: ["super_admin"] })).rejects.toThrow(/cannot be assigned/);
    await expect(svc.create(admin, { ...good, roles: ["ghost"] })).rejects.toThrow(/cannot be assigned/);
  });

  it("rejects weak passwords", async () => {
    const { svc } = setup();
    await expect(svc.create(admin, { ...good, password: "short1" })).rejects.toThrow();
    await expect(svc.create(admin, { ...good, password: "nonumbersatall" })).rejects.toThrow();
  });

  it("cannot remove or suspend yourself", async () => {
    const { svc } = setup();
    await expect(svc.remove(admin, "admin")).rejects.toThrow(/your own/);
    await expect(svc.update(admin, "admin", { status: "suspended" })).rejects.toThrow(/your own/);
  });

  it("keeps at least one active HR admin", async () => {
    const { svc } = setup();
    const other = { ...admin, id: "bob" };
    await expect(svc.remove(other, "admin")).rejects.toThrow(/at least one active HR admin/);
    await expect(svc.update(other, "admin", { roles: ["employee"] })).rejects.toThrow(/at least one/);
    await svc.update(admin, "bob", { roles: ["hr_admin"] });
    await expect(svc.remove({ ...admin, id: "bob" }, "admin")).resolves.toBeUndefined();
  });

  it("does not see accounts of another tenant", async () => {
    const { svc } = setup();
    await expect(svc.get({ ...admin, tenantId: "t2" }, "bob")).rejects.toThrow(/not found/);
  });

  it("detects a stale edit", async () => {
    const { svc } = setup();
    await svc.update(admin, "bob", { displayName: "One", version: 1 });
    await expect(svc.update(admin, "bob", { displayName: "Two", version: 1 })).rejects.toThrow(/changed by someone else/);
  });

  it("signs the person out when suspended, removed or given a new password", async () => {
    const { svc, revoked, audit } = setup();
    await svc.update(admin, "bob", { password: "newpassword1" });
    await svc.update(admin, "bob", { status: "suspended" });
    await svc.remove(admin, "bob");
    expect(revoked).toEqual(["bob", "bob", "bob"]);
    expect(JSON.stringify(audit.entries)).not.toContain("newpassword1");
  });

  it("restores a removed account", async () => {
    const { svc, audit } = setup();
    await svc.remove(admin, "bob");
    expect((await svc.restore(admin, "bob")).deletedAt).toBeNull();
    expect(audit.entries.map((e) => e.action)).toEqual(["user.delete", "user.restore"]);
  });
});

describe("signup", () => {
  function signupSetup(taken: string[] = [], allow?: (k: string) => boolean) {
    const created: Parameters<SignupRepository["createTenant"]>[0][] = [];
    const repo: SignupRepository = {
      codeExists: async (c) => taken.includes(c),
      roleExists: async () => true,
      createTenant: async (t) => {
        created.push(t);
        return { tenantId: "tn", userId: "un" };
      },
    };
    const audit = new InMemoryAuditWriter();
    const logs: string[] = [];
    const svc = createSignupService({
      repo,
      audit,
      allow,
      hasher: { hash: async (p) => `h:${p}`, verify: async () => true },
      log: { info: () => logs.push("info"), warn: () => logs.push("warn"), error: () => logs.push("error") },
    });
    return { svc, created, audit, logs };
  }
  const input = { companyName: "Acme Ltd.", displayName: "Ann", email: "Ann@Acme.com", password: "longpassword1" };

  it("creates a company with its first HR admin", async () => {
    const { svc, created, audit, logs } = signupSetup();
    const out = await svc.signUp(input);
    expect(out).toMatchObject({ tenantId: "tn", userId: "un", email: "ann@acme.com" });
    expect(created[0]).toMatchObject({
      code: "acme-ltd",
      name: "Acme Ltd.",
      admin: { email: "ann@acme.com", role: "hr_admin", passwordHash: "h:longpassword1" },
    });
    expect(audit.entries.map((e) => e.action)).toEqual(["tenant.create", "user.create"]);
    expect(JSON.stringify(audit.entries)).not.toContain("longpassword1");
    expect(logs).toEqual(["info"]);
  });

  it("picks another code when the name is taken", async () => {
    const { svc, created } = signupSetup(["acme-ltd"]);
    await svc.signUp(input);
    expect(created[0].code).toMatch(/^acme-ltd-[0-9a-f]{4}$/);
  });

  it("rejects bad input and throttled callers without creating anything", async () => {
    const { svc, created, logs } = signupSetup();
    await expect(svc.signUp({ ...input, password: "weak" })).rejects.toThrow();
    const limited = signupSetup([], () => false);
    await expect(limited.svc.signUp(input)).rejects.toThrow(/Too many/);
    expect(created.length + limited.created.length).toBe(0);
    expect(logs).toEqual(["warn"]);
  });
});

describe("slugify", () => {
  it("makes a short lowercase code", () => {
    expect(slugify("  Café & Sons, Ltd. ")).toBe("cafe-sons-ltd");
    expect(slugify("!!!")).toBe("company");
    expect(slugify("x".repeat(60)).length).toBeLessThanOrEqual(24);
  });
});
