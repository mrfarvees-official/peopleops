import { z } from "zod";
import type { SessionUser } from "../domain/auth";
import {
  ATTRIBUTE_OPTIONS,
  OPERATOR_OPTIONS,
  humanize,
  type Option,
} from "../domain/pbac";
import { createAudit } from "./audit-api";
import type { AuditWriter } from "./audit-writer";
import type { Authorizer } from "./pbac";
import type {
  PolicyAdminRepository,
  PolicyInput,
  PolicyView,
} from "./pbac-ports";

export class PolicyNotFoundError extends Error {
  constructor() {
    super("Policy not found");
    this.name = "PolicyNotFoundError";
  }
}

/** The policy exists but may not be changed through the API (global or seeded). */
export class PolicyImmutableError extends Error {
  constructor() {
    super("System policies are managed by the seeder");
    this.name = "PolicyImmutableError";
  }
}

const code = z.string().regex(/^[a-z0-9][a-z0-9_-]{1,63}$/);
const attr = z
  .string()
  .max(128)
  .regex(/^(action|(subject|resource|env)(\.[A-Za-z0-9_]+)+)$/);

const subject = z.discriminatedUnion("type", [
  z.object({ type: z.literal("any") }),
  z.object({ type: z.literal("role"), role: code }),
  z.object({ type: z.literal("user"), userId: z.string().uuid() }),
]);

const condition = z
  .object({
    attribute: attr,
    operator: z.enum([
      "eq", "neq", "in", "not_in", "gt", "gte", "lt", "lte", "contains", "exists",
    ]),
    value: z.unknown().optional(),
    ref: attr.optional(),
  })
  .refine(
    (c) => c.operator === "exists" || c.value !== undefined || c.ref !== undefined,
    { message: "value or ref is required" },
  );

export const policyInput = z.object({
  code,
  name: z.string().min(1).max(128),
  description: z.string().max(255).optional(),
  effect: z.enum(["allow", "deny"]),
  isActive: z.boolean().default(true),
  // undefined = the caller's own tenant, null = global (all tenants)
  tenantId: z.string().uuid().nullable().optional(),
  subjects: z.array(subject).min(1).max(50),
  // null = any action / any resource
  targets: z
    .array(z.object({ action: code.nullable(), resource: code.nullable() }))
    .min(1)
    .max(200),
  conditions: z.array(condition).max(50).default([]),
});

export interface AdminCtx {
  requestId?: string;
  ip?: string;
}

export interface PbacAdminDeps {
  repo: PolicyAdminRepository;
  authz: Authorizer;
  audit: AuditWriter;
}

export interface PolicyCatalogue {
  actions: Option[];
  resources: Option[];
  roles: Option[];
  tenants: Option[];
  users: Option[];
  attributes: Option[];
  operators: Option[];
}

const snapshot = (p: PolicyView | PolicyInput) => ({
  code: p.code,
  effect: p.effect,
  isActive: p.isActive,
  subjects: p.subjects,
  targets: p.targets,
  conditions: p.conditions,
});

export function createPbacAdmin({ repo, authz, audit: writer }: PbacAdminDeps) {
  // Authorization is always checked against the tenant the policy lives in.
  // Global policies are checked against the caller's own tenant.
  const target = (user: SessionUser, tenantId: string | null, id?: string) => ({
    type: "policy",
    id,
    tenantId: tenantId ?? user.tenantId,
  });
  const auditFor = (user: SessionUser, ctx: AdminCtx) =>
    createAudit(writer, { tenantId: user.tenantId, actorId: user.id, ...ctx });

  async function load(id: string) {
    const p = await repo.get(id);
    if (!p) throw new PolicyNotFoundError();
    return p;
  }

  const ensureMutable = (p: PolicyView) => {
    if (p.isSystem) throw new PolicyImmutableError();
  };

  return {
    // Everything the caller may view: global policies plus every tenant they are allowed to see.
    async list(user: SessionUser, ctx: AdminCtx = {}) {
      await authz.assert(user, "viewAny", target(user, null), ctx);
      const { tenants } = await repo.catalogue();
      const visible: string[] = [];
      for (const t of tenants) {
        if (await authz.can(user, "viewAny", target(user, t.id), ctx)) {
          visible.push(t.id);
        }
      }
      return repo.list(visible);
    },

    async get(user: SessionUser, id: string, ctx: AdminCtx = {}) {
      const p = await load(id);
      await authz.assert(user, "view", target(user, p.tenantId, id), ctx);
      return p;
    },

    async create(user: SessionUser, raw: unknown, ctx: AdminCtx = {}) {
      const { tenantId: scope, ...input } = policyInput.parse(raw);
      const tenantId = scope === undefined ? user.tenantId : scope;
      await authz.assert(user, "create", target(user, tenantId), ctx);
      const created = await repo.create(tenantId, input);
      await auditFor(user, ctx).created(
        { type: "policy", id: created.id },
        snapshot(created),
      );
      return created;
    },

    // The scope (tenant or global) of an existing policy never changes.
    async update(user: SessionUser, id: string, raw: unknown, ctx: AdminCtx = {}) {
      const { tenantId: _ignored, ...input } = policyInput.parse(raw);
      const before = await load(id);
      await authz.assert(user, "update", target(user, before.tenantId, id), ctx);
      ensureMutable(before);
      const after = await repo.update(id, before.tenantId, input);
      await auditFor(user, ctx).updated(
        { type: "policy", id },
        snapshot(before),
        snapshot(after),
      );
      return after;
    },

    async remove(user: SessionUser, id: string, ctx: AdminCtx = {}) {
      const before = await load(id);
      await authz.assert(user, "delete", target(user, before.tenantId, id), ctx);
      ensureMutable(before);
      await repo.remove(id);
      await auditFor(user, ctx).deleted({ type: "policy", id }, snapshot(before));
    },

    // Every dropdown the policy editor needs, with readable labels.
    async catalogue(user: SessionUser, ctx: AdminCtx = {}): Promise<PolicyCatalogue> {
      await authz.assert(user, "viewAny", target(user, null), ctx);
      const raw = await repo.catalogue();
      return {
        actions: raw.actions.map((a) => ({
          value: a.code,
          label: humanize(a.code),
          description: a.description ?? undefined,
        })),
        resources: raw.resources.map((r) => ({
          value: r.code,
          label: humanize(r.code),
          description: r.description ?? undefined,
        })),
        roles: raw.roles.map((r) => ({
          value: r.code,
          label: r.name,
          description: r.description ?? undefined,
        })),
        tenants: raw.tenants.map((t) => ({ value: t.id, label: t.name })),
        users: raw.users.map((u) => ({
          value: u.id,
          label: `${u.displayName} (${u.email}) · ${u.tenantName}`,
        })),
        attributes: ATTRIBUTE_OPTIONS,
        operators: OPERATOR_OPTIONS,
      };
    },
  };
}

export type PbacAdmin = ReturnType<typeof createPbacAdmin>;
