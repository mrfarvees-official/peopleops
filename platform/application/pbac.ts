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
}

export function createAuthorizer({ repo, audit: writer }: PbacDeps) {
  async function authorize(
    user: SessionUser,
    action: string,
    resource: AuthzResource,
    ctx: AuthzContext = {},
  ): Promise<Decision> {
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
    return decision;
  }

  return { authorize, can, assert };
}

export type Authorizer = ReturnType<typeof createAuthorizer>;
