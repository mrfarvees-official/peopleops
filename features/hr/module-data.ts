import "server-only";

import { notFound } from "next/navigation";
import { requestInfo, requireUser } from "@/server/session";
import { getHrModule } from "@/server/hr";
import { getTenantInfo } from "@/server/tenant";

/**
 * Loads a module for a page: the signed-in user, the module, how to format
 * values for their company, and its fields. A missing module is a 404;
 * a denied request becomes `denied: true` so the page can say so.
 */
export async function openModule(key: string) {
  const user = await requireUser();
  let hrModule;
  try {
    hrModule = getHrModule(key);
  } catch {
    notFound();
  }
  const [tenant, ctx] = await Promise.all([
    getTenantInfo(user.tenantId),
    requestInfo(),
  ]);
  return {
    user,
    module: hrModule,
    ctx,
    locale: { timezone: tenant.timezone, currency: tenant.currency },
  };
}

export const isForbidden = (e: unknown) =>
  (e as Error)?.name === "ForbiddenError";
export const isMissing = (e: unknown) =>
  ["RecordNotFoundError", "ModuleNotFoundError"].includes((e as Error)?.name);

/** Where a record leads next (kept out of the module definitions: it is navigation, not data). */
export const RELATED: Record<
  string,
  (rec: { id: string }) => { label: string; href: string }[]
> = {
  "payroll-runs": (r) => [
    { label: "View payslips", href: `/hr/payslips?runId=${r.id}` },
  ],
};
