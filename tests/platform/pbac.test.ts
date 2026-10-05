import { describe, expect, it } from "vitest";
import { createAuthorizer } from "@/platform/application/pbac";
import type { PolicyRepository } from "@/platform/application/pbac-ports";
import {
  ForbiddenError,
  evaluate,
  type Policy,
  type AuthzSubject,
} from "@/platform/domain/pbac";
import type { SessionUser } from "@/platform/domain/auth";
import { InMemoryAuditWriter } from "@/platform/infrastructure/in-memory-audit-writer";

const policy = (p: Partial<Policy> & Pick<Policy, "code" | "effect">): Policy => ({
  id: p.code,
  subjects: [{ type: "any" }],
  targets: [{ action: null, resource: null }],
  conditions: [],
  ...p,
});

const subject = (roles: string[], id = "u1"): AuthzSubject => ({
  id,
  tenantId: "t1",
  roles,
});

const req = (s: AuthzSubject, action = "view", type = "employee", extra = {}) => ({
  subject: s,
  action,
  resource: { type, ...extra },
});

describe("pbac evaluate", () => {
  it("denies by default", () => {
    expect(evaluate([], req(subject(["hr_admin"])))).toMatchObject({
      allowed: false,
      reason: "no_matching_policy",
    });
  });

  it("allows when a role/action/resource policy matches", () => {
    const p = policy({
      code: "hr",
      effect: "allow",
      subjects: [{ type: "role", role: "hr_admin" }],
      targets: [{ action: "view", resource: "employee" }],
    });
    expect(evaluate([p], req(subject(["hr_admin"]))).allowed).toBe(true);
    expect(evaluate([p], req(subject(["employee"]))).allowed).toBe(false);
    expect(evaluate([p], req(subject(["hr_admin"]), "delete")).allowed).toBe(false);
    expect(evaluate([p], req(subject(["hr_admin"]), "view", "payslip")).allowed).toBe(false);
  });

  it("explicit deny beats allow", () => {
    const allow = policy({ code: "a", effect: "allow" });
    const deny = policy({
      code: "d",
      effect: "deny",
      targets: [{ action: "delete", resource: null }],
    });
    expect(evaluate([allow, deny], req(subject(["x"]), "delete"))).toMatchObject({
      allowed: false,
      reason: "explicit_deny",
      matched: ["a", "d"],
    });
  });

  it("evaluates attribute conditions, including refs (ownership)", () => {
    const own = policy({
      code: "own",
      effect: "allow",
      conditions: [{ attribute: "resource.ownerId", operator: "eq", ref: "subject.id" }],
    });
    expect(evaluate([own], req(subject([], "u1"), "view", "payslip", { ownerId: "u1" })).allowed).toBe(true);
    expect(evaluate([own], req(subject([], "u1"), "view", "payslip", { ownerId: "u2" })).allowed).toBe(false);
  });

  it("fails closed when an attribute is missing", () => {
    const own = policy({
      code: "own",
      effect: "allow",
      conditions: [{ attribute: "resource.ownerId", operator: "eq", ref: "subject.id" }],
    });
    expect(evaluate([own], req(subject([]))).allowed).toBe(false);
    const notDenied = policy({
      code: "d",
      effect: "deny",
      conditions: [{ attribute: "resource.locked", operator: "neq", value: true }],
    });
    // missing attribute => condition false => deny policy does not apply
    expect(evaluate([policy({ code: "a", effect: "allow" }), notDenied], req(subject([]))).allowed).toBe(true);
  });

  it("system_developer bypasses everything, even explicit denies", () => {
    const deny = policy({ code: "d", effect: "deny" });
    expect(evaluate([deny], req(subject(["system_developer"])))).toEqual({
      allowed: true,
      reason: "bypass",
      matched: [],
    });
  });
});

describe("pbac authorizer", () => {
  const user = (roles: string[]): SessionUser => ({
    id: "u1",
    tenantId: "t1",
    email: "a@b.c",
    displayName: "A",
    roles,
  });

  const make = (policies: Policy[]) => {
    let calls = 0;
    const repo: PolicyRepository = {
      findApplicable: async () => (calls++, policies),
    };
    const audit = new InMemoryAuditWriter();
    return { pbac: createAuthorizer({ repo, audit }), audit, calls: () => calls };
  };

  it("assert throws ForbiddenError and audits the denial", async () => {
    const { pbac, audit } = make([]);
    await expect(
      pbac.assert(user(["employee"]), "delete", { type: "employee", id: "e1", tenantId: "t1" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(audit.entries[0]).toMatchObject({
      actorId: "u1",
      action: "employee.delete",
      outcome: "denied",
    });
  });

  it("assert passes when allowed", async () => {
    const { pbac } = make([policy({ code: "a", effect: "allow" })]);
    await expect(
      pbac.assert(user(["employee"]), "view", { type: "employee", tenantId: "t1" }),
    ).resolves.toMatchObject({ allowed: true });
  });

  it("assert audits a system_developer bypass, authorize/can do not", async () => {
    const { pbac, audit } = make([policy({ code: "d", effect: "deny" })]);
    const dev = user(["system_developer"]);
    const res = { type: "employee", id: "e1", tenantId: "t2" };
    await pbac.can(dev, "delete", res);
    expect(audit.entries).toHaveLength(0);
    await pbac.assert(dev, "delete", res, { ip: "1.2.3.4" });
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({
      tenantId: "t2",
      actorId: "u1",
      action: "pbac.bypass",
      resourceType: "employee",
      resourceId: "e1",
      outcome: "success",
      ip: "1.2.3.4",
    });
  });

  it("rejects a resource without tenantId", async () => {
    const { pbac } = make([]);
    await expect(
      pbac.authorize(user(["system_developer"]), "view", { type: "employee" }),
    ).rejects.toThrow("tenantId");
  });

  it("system_developer skips policy lookup and is never denied", async () => {
    const { pbac, calls } = make([policy({ code: "d", effect: "deny" })]);
    expect(await pbac.can(user(["system_developer"]), "delete", { type: "payroll_run", tenantId: "t1" })).toBe(true);
    expect(calls()).toBe(0);
  });
});
