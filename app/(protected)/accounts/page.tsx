import Link from "next/link";
import { AccountActionButton } from "@/features/accounts/account-actions";
import { AccessDenied } from "@/features/pbac/access-denied";
import { getAccounts } from "@/server/accounts";
import { can } from "@/server/authorization";
import { requireUser } from "@/server/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Accounts" };

const roleLabel = (c: string) =>
  c.replace(/_/g, " ").replace(/^./, (m) => m.toUpperCase());

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ removed?: string }>;
}) {
  const user = await requireUser();
  if (!(await can("viewAny", { type: "user", tenantId: user.tenantId }))) {
    return <AccessDenied what="manage accounts" />;
  }
  const showRemoved = (await searchParams).removed === "1";
  const [accounts, mayCreate] = await Promise.all([
    getAccounts().list(user, { includeRemoved: showRemoved }),
    can("create", { type: "user", tenantId: user.tenantId }),
  ]);

  // Buttons are only a convenience; the API re-checks every action.
  const rows = await Promise.all(
    accounts.map(async (a) => {
      const res = {
        type: "user",
        id: a.id,
        tenantId: user.tenantId,
        ownerId: a.id,
        status: a.status,
      };
      const [update, remove, restore] = await Promise.all([
        can("update", res),
        can("delete", res),
        can("restore", res),
      ]);
      return { a, update, remove: remove && a.id !== user.id, restore };
    }),
  );

  return (
    <main className="flex h-full min-h-96 w-full flex-col p-6">
      <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Accounts</h1>
          <p className="text-sm text-muted">People who can sign in to this company.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={showRemoved ? "/accounts" : "/accounts?removed=1"}
            className="rounded border px-3 py-2 text-sm hover:bg-surface-2"
          >
            {showRemoved ? "Hide removed" : "Show removed"}
          </Link>
          {mayCreate && (
            <Link
              href="/accounts/new"
              className="rounded bg-accent px-4 py-2 text-sm text-accent-foreground"
            >
              New account
            </Link>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded border">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-surface text-muted shadow-[0_1px_0_var(--border)]">
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">Email</th>
              <th className="p-3">Roles</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ a, update, remove, restore }) => (
              <tr key={a.id} className="border-t">
                <td className="p-3 font-medium">
                  {a.displayName}
                  {a.id === user.id && (
                    <span className="ml-2 rounded border px-1.5 text-xs text-muted">You</span>
                  )}
                </td>
                <td className="p-3">{a.email}</td>
                <td className="p-3">{a.roles.map(roleLabel).join(", ")}</td>
                <td className="p-3">
                  {a.deletedAt
                    ? "Removed"
                    : a.status === "suspended"
                      ? "Suspended"
                      : a.status === "invited"
                        ? "Invited"
                        : "Active"}
                </td>
                <td className="p-3">
                  <div className="flex justify-end gap-2">
                    {a.deletedAt ? (
                      restore && (
                        <AccountActionButton id={a.id} name={a.displayName} kind="restore" />
                      )
                    ) : (
                      <>
                        {update && (
                          <Link
                            href={`/accounts/${a.id}/edit`}
                            className="rounded border px-3 py-1 hover:bg-surface-2"
                          >
                            Edit
                          </Link>
                        )}
                        {remove && (
                          <AccountActionButton id={a.id} name={a.displayName} kind="remove" />
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted">
                  No accounts.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
