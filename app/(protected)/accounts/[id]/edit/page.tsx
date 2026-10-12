import { notFound } from "next/navigation";
import { AccountForm } from "@/features/accounts/account-form";
import { AccessDenied } from "@/features/pbac/access-denied";
import { getAccounts, getAssignableRoles } from "@/server/accounts";
import { can } from "@/server/authorization";
import { requireUser } from "@/server/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit account" };

export default async function EditAccountPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  let account;
  try {
    account = await getAccounts().get(user, id);
  } catch (e) {
    const name = (e as Error)?.name;
    if (name === "AccountNotFoundError") notFound();
    if (name === "ForbiddenError") return <AccessDenied what="view this account" />;
    throw e;
  }
  const mayUpdate = await can("update", {
    type: "user",
    id,
    tenantId: user.tenantId,
    ownerId: account.id,
    status: account.status,
  });
  if (!mayUpdate || account.deletedAt) {
    return <AccessDenied what="edit this account" />;
  }
  return (
    <AccountForm
      roles={await getAssignableRoles()}
      isSelf={account.id === user.id}
      initial={{
        id: account.id,
        email: account.email,
        displayName: account.displayName,
        status: account.status,
        roles: account.roles,
        version: account.version,
      }}
    />
  );
}
