import { describe, expect, it } from "vitest";
import {
  createAuditQuery,
  type AuditQueryRepository,
  type AuditRow,
  type AuditSearch,
} from "@/platform/application/audit-query";
import { createAuthorizer } from "@/platform/application/pbac";
import type { PolicyRepository } from "@/platform/application/pbac-ports";
import type { SessionUser } from "@/platform/domain/auth";
import type { Policy } from "@/platform/domain/pbac";
import { InMemoryAuditWriter } from "@/platform/infrastructure/in-memory-audit-writer";

const allowAuditView: Policy = {
  id: "p1",
  code: "audit-view",
  effect: "allow",
  subjects: [{ type: "role", role: "auditor" }],
  targets: [{ action: null, resource: "audit_log" }],
  conditions: [],
};

// Tenant isolation, like the seeded deny-cross-tenant policy.
const crossTenantDeny: Policy = {
  id: "p2",
  code: "deny-cross-tenant",
  effect: "deny",
  subjects: [{ type: "any" }],
  targets: [{ action: null, resource: null }],
  conditions: [
    { attribute: "resource.tenantId", operator: "neq", ref: "subject.tenantId" },
  ],
};

const user = (roles: string[], tenantId = "t1"): SessionUser => ({
  id: "u1",
  tenantId,
  email: "a@b.c",
  displayName: "A",
  roles,
});

const row = (id: string, tenantId: string | null): AuditRow => ({
  id,
  occurredAt: new Date("2026-10-05T10:00:00Z"),
  tenantId,
  actorId: "u1",
  action: "employee.create",
  resourceType: "employee",
  resourceId: "e1",
  outcome: "success",
  reason: null,
  requestId: null,
  ip: null,
  before: null,
  after: null,
});

function setup() {
  const searches: AuditSearch[] = [];
  const repo: AuditQueryRepository = {
    search: async (q) => (searches.push(q), { rows: [row("1", "t1")], total: 1 }),
    get: async (id) => (id === "1" ? row("1", "t2") : null),
    catalogue: async () => ({
      tenants: [
        { id: "t1", name: "One" },
        { id: "t2", name: "Two" },
      ],
      actors: [],
      actions: ["employee.create"],
      resourceTypes: ["employee"],
    }),
  };
  const policies: PolicyRepository = {
    findApplicable: async () => [allowAuditView, crossTenantDeny],
  };
  const audit = new InMemoryAuditWriter();
  const logs: { level: string; obj: Record<string, unknown>; msg: string }[] = [];
  const log = {
    info: (obj: object, msg: string) => logs.push({ level: "info", obj: obj as never, msg }),
    warn: (obj: object, msg: string) => logs.push({ level: "warn", obj: obj as never, msg }),
    error: (obj: object, msg: string) => logs.push({ level: "error", obj: obj as never, msg }),
  };
  const authz = createAuthorizer({ repo: policies, audit });
  return { svc: createAuditQuery({ repo, authz, log }), searches, logs, audit };
}

describe("audit query", () => {
  it("denies users without a policy, audits the denial and logs a warning", async () => {
    const { svc, logs, audit } = setup();
    await expect(svc.list(user(["employee"]), {})).rejects.toMatchObject({
      name: "ForbiddenError",
    });
    expect(audit.entries[0]).toMatchObject({ outcome: "denied" });
    expect(logs.at(-1)).toMatchObject({
      level: "warn",
      obj: { feature: "audit-log", action: "viewAny", outcome: "denied" },
    });
  });

  it("limits a tenant-bound role to its own tenant", async () => {
    const { svc, searches, logs } = setup();
    await svc.list(user(["auditor"]), {});
    expect(searches[0]).toMatchObject({ tenantIds: ["t1"], includeSystem: false });
    expect(logs.at(-1)).toMatchObject({ level: "info", obj: { outcome: "success" } });
  });

  it("lets system_developer see every tenant and system entries", async () => {
    const { svc, searches } = setup();
    await svc.list(user(["system_developer"]), {});
    expect(searches[0]).toMatchObject({ tenantIds: ["t1", "t2"], includeSystem: true });
  });

  it("ignores bad filter values and clamps paging", async () => {
    const { svc, searches } = setup();
    await svc.list(user(["auditor"]), {
      outcome: "bogus",
      from: "not-a-date",
      page: "abc",
      size: "7",
      action: "employee.create",
    });
    expect(searches[0]).toMatchObject({
      skip: 0,
      take: 25,
      filters: { action: "employee.create" },
    });
    expect(searches[0].filters.outcome).toBeUndefined();
    expect(searches[0].filters.from).toBeUndefined();
  });

  it("pages with the requested size", async () => {
    const { svc, searches } = setup();
    await svc.list(user(["auditor"]), { size: "50", page: "3" });
    expect(searches[0]).toMatchObject({ skip: 100, take: 50 });
  });

  it("blocks viewing an entry from another tenant", async () => {
    const { svc } = setup();
    await expect(svc.get(user(["auditor"]), "1")).rejects.toMatchObject({
      name: "ForbiddenError",
    });
    await expect(svc.get(user(["system_developer"]), "1")).resolves.toMatchObject({
      id: "1",
    });
  });

  it("reports a missing entry as not found", async () => {
    const { svc } = setup();
    await expect(svc.get(user(["auditor"]), "99")).rejects.toMatchObject({
      name: "AuditEntryNotFoundError",
    });
  });
});
