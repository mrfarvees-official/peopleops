import "server-only";

import { container } from "@/server/composition";
import { can } from "@/server/authorization";
import { requireUser } from "@/server/session";

/**
 * Audit log screens: PBAC decides (super_admin and auditor by policy,
 * system_developer by bypass). Returns the user, or null so the page can
 * render <AccessDenied />.
 */
export async function requireAuditAccess(action: "viewAny" | "view") {
  const user = await requireUser();
  const ok = await can(action, { type: "audit_log", tenantId: user.tenantId });
  if (!ok) {
    // The page renders "Access denied" without reaching the service, so log it here.
    container.logger.warn(
      {
        feature: "audit-log",
        action,
        resourceType: "audit_log",
        actorId: user.id,
        tenantId: user.tenantId,
        outcome: "denied",
      },
      `audit-log ${action} denied`,
    );
  }
  return ok ? user : null;
}
