import { AccountForm } from "@/features/accounts/account-form";
import { AccessDenied } from "@/features/pbac/access-denied";
import { getAssignableRoles } from "@/server/accounts";
import { can } from "@/server/authorization";
import { requireUser } from "@/server/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "New account" };

export default async function NewAccountPage() {
  const user = await requireUser();
  if (!(await can("create", { type: "user", tenantId: user.tenantId }))) {
    return <AccessDenied what="create accounts" />;
  }
  return <AccountForm roles={await getAssignableRoles()} />;
}
