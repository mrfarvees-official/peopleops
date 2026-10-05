import type { SessionUser } from "../domain/auth";
import {
  AuthzContext,
  ForbiddenError,
  evaluate,
  isBypass,
  type AuthzResource,
  type Decision,
} from "../domain/pbac";
import { createAudit } from "./audit-api";
import type { AuditWriter } from "./audit-writer";
import type { PolicyRepository } from "./pbac-ports";

export interface PbacDeps {
  repo: PolicyRepository;
  audit: AuditWriter;
  /** The audit.log_views setting. Off (the default) mutes view and list entries. */
  logViews?: () => Promise<boolean> | boolean;
}

export function createAuthorizer({
  repo,
  audit: writer,
  logViews = () => false,
}: PbacDeps) {
  async function authorize(
    user: SessionUser,
    action: string,
    resource: AuthzResource,
    ctx: AuthzContext = {},
  ): Promise<Decision> {
    // Tenant isolation (deny-cross-tenant) compares resource.tenantId, so a
    // resource without one would silently skip it. Fail closed instead.
    if (!resource.tenantId) {
      throw new Error("PBAC: resource.tenantId is required");
    }
    if (isBypass(user)) return { allowed: true, reason: "bypass", matched: [] };
    const policies = await repo.findApplicable({
      tenantId: user.tenantId,
      userId: user.id,
      roles: user.roles,
    });
    return evaluate(policies, {
      subject: { ...user },
      action,
      resource,
      env: ctx.env,
    });
  }

  /**
   * Many checks for one user with a single policy load (lists: one check per
   * row and action). Same rules as authorize(); results keep the input order.
   */
  async function authorizeMany(
    user: SessionUser,
    requests: { action: string; resource: AuthzResource }[],
    ctx: AuthzContext = {},
  ): Promise<Decision[]> {
    for (const r of requests) {
      if (!r.resource.tenantId) throw new Error("PBAC: resource.tenantId is required");
    }
    if (isBypass(user)) {
      return requests.map(() => ({ allowed: true, reason: "bypass" as const, matched: [] }));
    }
    if (requests.length === 0) return [];
    const policies = await repo.findApplicable({
      tenantId: user.tenantId,
      userId: user.id,
      roles: user.roles,
    });
    return requests.map((r) =>
      evaluate(policies, {
        subject: { ...user },
        action: r.action,
        resource: r.resource,
        env: ctx.env,
      }),
    );
  }

  const can = async (
    user: SessionUser,
    action: string,
    resource: AuthzResource,
    ctx?: AuthzContext,
  ) => (await authorize(user, action, resource, ctx)).allowed;

  // Throws ForbiddenError and audits the denial. Allowed calls are not audited
  // here, because the feature's own create/update audit already covers them.
  async function assert(
    user: SessionUser,
    action: string,
    resource: AuthzResource,
    ctx: AuthzContext = {},
  ): Promise<Decision> {
    const decision = await authorize(user, action, resource, ctx);
    if (!decision.allowed) {
      const reason = `PBAC ${decision.reason}${
        decision.matched.length ? `: ${decision.matched.join(",")}` : ""
      }`.slice(0, 255);
      await createAudit(writer, {
        tenantId: user.tenantId,
        actorId: user.id,
        requestId: ctx.requestId,
        ip: ctx.ip,
      }).denied(action, { type: resource.type, id: resource.id }, reason);
      throw new ForbiddenError(decision);
    }
    // Views and lists happen on every page load, so recording them is a
    // database write per refresh. They are recorded only when the
    // audit.log_views setting is on, and never for the audit log itself
    // (reading it would otherwise add a row each time).
    const isView = action === "view" || action === "viewAny";
    if (isView) {
      if (resource.type === "audit_log" || !(await logViews())) return decision;
      await createAudit(writer, {
        tenantId: resource.tenantId,
        actorId: user.id,
        requestId: ctx.requestId,
        ip: ctx.ip,
      }).viewed(action, { type: resource.type, id: resource.id });
    }
    // system_developer overrides every policy, so each enforced use is recorded.
    // Written here, not in authorize(), so UI visibility checks don't flood the log.
    if (decision.reason === "bypass") {
      await writer.record({
        tenantId: resource.tenantId,
        actorId: user.id,
        requestId: ctx.requestId,
        ip: ctx.ip,
        action: "pbac.bypass",
        resourceType: resource.type,
        resourceId: resource.id,
        outcome: "success",
        reason: `PBAC bypass: ${action} ${resource.type}`.slice(0, 255),
        after: { action, actorTenantId: user.tenantId },
      });
    }
    return decision;
  }

  return { authorize, authorizeMany, can, assert };
}

export type Authorizer = ReturnType<typeof createAuthorizer>;
