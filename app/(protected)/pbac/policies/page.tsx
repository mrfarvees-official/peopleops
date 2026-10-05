import { AccessDenied } from "@/features/pbac/access-denied";
import Link from "next/link";
import { DeletePolicyButton } from "@/features/pbac/delete-policy-button";
import { scopeText } from "@/features/pbac/describe";
import { requirePolicyAccess } from "@/features/pbac/guard";
import { lookups } from "@/features/pbac/types";
import { can } from "@/server/authorization";
import { getPbacAdmin } from "@/server/pbac";

export const dynamic = "force-dynamic";
export const metadata = { title: "Policies" };

const SIZES = [25, 50, 100] as const;
const DEFAULT_SIZE = 25;

const href = (page: number, size: number) =>
  `/pbac/policies?size=${size}&page=${page}`;

export default async function PoliciesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; size?: string }>;
}) {
  const user = await requirePolicyAccess("viewAny");
  if (!user) return <AccessDenied />;
  const admin = getPbacAdmin();
  const [all, catalogue, mayCreate] = await Promise.all([
    admin.list(user),
    admin.catalogue(user),
    can("create", { type: "policy", tenantId: user.tenantId }),
  ]);
  const l = lookups(catalogue);

  // Paging: the whole list is small, so slice it here and only check
  // edit/delete rights for the rows on screen.
  const sp = await searchParams;
  const requested = Number(sp.size);
  const size = (SIZES as readonly number[]).includes(requested)
    ? requested
    : DEFAULT_SIZE;
  const pages = Math.max(1, Math.ceil(all.length / size));
  const page = Math.min(Math.max(1, Math.floor(Number(sp.page)) || 1), pages);
  const first = (page - 1) * size;
  const policies = all.slice(first, first + size);

  const rows = await Promise.all(
    policies.map(async (p) => {
      const tenantId = p.tenantId ?? user.tenantId;
      const [mayUpdate, mayDelete] = await Promise.all([
        can("update", { type: "policy", id: p.id, tenantId }),
        can("delete", { type: "policy", id: p.id, tenantId }),
      ]);
      return {
        p,
        editable: !p.isSystem && mayUpdate,
        deletable: !p.isSystem && mayDelete,
      };
    }),
  );

  return (
    <main className="flex h-full min-h-96 w-full flex-col p-6">
      <div className="mb-4 flex shrink-0 items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Policies</h1>
          <p className="text-sm text-muted">
            Rules that decide who can do what. Deny always wins; no matching
            rule means no access.
          </p>
        </div>
        {mayCreate && (
          <Link
            href="/pbac/policies/new"
            className="rounded bg-accent px-4 py-2 text-sm text-accent-foreground"
          >
            New policy
          </Link>
        )}
      </div>

      {/* Only this box scrolls; the title above and the pager below stay put. */}
      <div className="min-h-0 flex-1 overflow-auto rounded border">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-surface text-muted shadow-[0_1px_0_var(--border)]">
            <tr>
              <th className="p-3">Policy</th>
              <th className="p-3">Effect</th>
              <th className="p-3">Applies to</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, editable, deletable }) => (
              <tr key={p.id} className="border-t">
                <td className="p-3">
                  <Link
                    href={`/pbac/policies/${p.id}`}
                    className="font-medium hover:underline"
                  >
                    {p.name}
                  </Link>
                  {p.isSystem && (
                    <span className="ml-2 rounded border px-1.5 text-xs text-muted">
                      System
                    </span>
                  )}
                </td>
                <td
                  className={`p-3 ${p.effect === "deny" ? "text-danger" : "text-success"}`}
                >
                  {p.effect === "deny" ? "Deny" : "Allow"}
                </td>
                <td className="p-3">{scopeText(p, l)}</td>
                <td className="p-3">{p.isActive ? "Active" : "Inactive"}</td>
                <td className="p-3">
                  <div className="flex justify-end gap-2">
                    <Link
                      href={`/pbac/policies/${p.id}`}
                      className="rounded border px-3 py-1 hover:bg-surface-2"
                    >
                      View
                    </Link>
                    {editable && (
                      <Link
                        href={`/pbac/policies/${p.id}/edit`}
                        className="rounded border px-3 py-1 hover:bg-surface-2"
                      >
                        Edit
                      </Link>
                    )}
                    {deletable && (
                      <DeletePolicyButton id={p.id} name={p.name} />
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted">
                  No policies yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex shrink-0 flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-muted">
          {all.length === 0
            ? "0 policies"
            : `Showing ${first + 1}–${first + policies.length} of ${all.length}`}
        </p>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1" aria-label="Rows per page">
            <span className="mr-1 text-muted">Rows</span>
            {SIZES.map((n) => (
              <Link
                key={n}
                href={href(1, n)}
                aria-current={n === size ? "true" : undefined}
                className={`rounded border px-2 py-1 ${
                  n === size
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-surface-2"
                }`}
              >
                {n}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <Link
                href={href(page - 1, size)}
                className="rounded border px-3 py-1 hover:bg-surface-2"
              >
                Previous
              </Link>
            ) : (
              <span className="rounded border px-3 py-1 text-muted opacity-50">
                Previous
              </span>
            )}
            <span className="text-muted">
              Page {page} of {pages}
            </span>
            {page < pages ? (
              <Link
                href={href(page + 1, size)}
                className="rounded border px-3 py-1 hover:bg-surface-2"
              >
                Next
              </Link>
            ) : (
              <span className="rounded border px-3 py-1 text-muted opacity-50">
                Next
              </span>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
