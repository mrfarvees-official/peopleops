import "server-only";

import { getCurrentUser } from "./session";
import { getPbac } from "./pbac";
import type { AuthzContext, AuthzResource } from "../platform/domain/pbac";
import type { Decision } from "../platform/domain/pbac";

export async function authorize(
  action: string,
  resource: AuthzResource,
  ctx?: AuthzContext,
): Promise<Decision> {
  const user = await getCurrentUser();

  if (!user) { 
    throw new Error("Unauthenticated");
  }

  return getPbac().authorize(user, action, resource, ctx);
}

export async function can(
  action: string,
  resource: AuthzResource,
  ctx?: AuthzContext,
): Promise<boolean> {
  const decision = await authorize(action, resource, ctx);

  return decision.allowed;
}

export async function assertCan(
  action: string,
  resource: AuthzResource,
  ctx?: AuthzContext,
): Promise<Decision> {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("Unauthenticated");
  }

  return getPbac().assert(user, action, resource, ctx);
}
