import "server-only";

import { notFound } from "next/navigation";
import { can } from "@/server/authorization";
import { requireUser } from "@/server/session";

/**
 * Policy screens are only for users PBAC lets manage policies (super_admin by
 * policy, system_developer by bypass). Returns the user, or null when access
 * is denied so the page can render <AccessDenied />.
 */
export async function requirePolicyAccess(
  action: "viewAny" | "view" | "create" | "update" | "delete",
) {
  const user = await requireUser();
  const ok = await can(action, { type: "policy", tenantId: user.tenantId });
  return ok ? user : null;
}

import type { SessionUser } from "@/platform/domain/auth";
import { getPbacAdmin } from "@/server/pbac";

/** Loads a policy the user may view, or renders a 404. */
export async function getPolicyOr404(user: SessionUser, id: string) {
  try {
    return await getPbacAdmin().get(user, id);
  } catch (e) {
    if ((e as Error)?.name === "PolicyNotFoundError") notFound();
    throw e;
  }
}
