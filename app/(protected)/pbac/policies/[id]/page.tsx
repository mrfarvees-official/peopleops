import { AccessDenied } from "@/features/pbac/access-denied";
import Link from "next/link";
import { DeletePolicyButton } from "@/features/pbac/delete-policy-button";
import {
  conditionText,
  scopeText,
  subjectText,
  targetText,
} from "@/features/pbac/describe";
import { getPolicyOr404, requirePolicyAccess } from "@/features/pbac/guard";
import { lookups } from "@/features/pbac/types";

import { can } from "@/server/authorization";
import { getPbacAdmin } from "@/server/pbac";

export const dynamic = "force-dynamic";
export const metadata = { title: "Policy" };

const card = "space-y-2 rounded border bg-surface p-4";

export default async function PolicyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePolicyAccess("view");
  if (!user) return <AccessDenied />;
  const { id } = await params;
  const admin = getPbacAdmin();
  const policy = await getPolicyOr404(user, id);
  const l = lookups(await admin.catalogue(user));
  const resource = {
    type: "policy",
    id,
    tenantId: policy.tenantId ?? user.tenantId,
  };
  const [mayUpdate, mayDelete] = await Promise.all([
    can("update", resource),
    can("delete", resource),
  ]);

  return (
    <main className="mx-auto w-full max-w-4xl space-y-4 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/pbac/policies"
            className="text-sm text-muted hover:underline"
          >
            ← All policies
          </Link>
          <h1 className="text-2xl font-bold">{policy.name}</h1>
          {policy.description && (
            <p className="text-sm text-muted">{policy.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          {!policy.isSystem && mayUpdate && (
            <Link
              href={`/pbac/policies/${id}/edit`}
              className="rounded border px-3 py-1 text-sm hover:bg-surface-2"
            >
              Edit
            </Link>
          )}
          {!policy.isSystem && mayDelete && (
            <DeletePolicyButton
              id={id}
              name={policy.name}
              redirectTo="/pbac/policies"
            />
          )}
        </div>
      </div>

      <section className={card}>
        <dl className="grid gap-2 text-sm md:grid-cols-2">
          <div>
            <dt className="text-muted">Effect</dt>
            <dd
              className={
                policy.effect === "deny" ? "text-danger" : "text-success"
              }
            >
              {policy.effect === "deny" ? "Deny" : "Allow"}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Status</dt>
            <dd>{policy.isActive ? "Active" : "Inactive"}</dd>
          </div>
          <div>
            <dt className="text-muted">Applies to</dt>
            <dd>{scopeText(policy, l)}</dd>
          </div>
          <div>
            <dt className="text-muted">Version</dt>
            <dd>
              {policy.version}
              {policy.isSystem &&
                " · System policy (managed by the seeder, read-only)"}
            </dd>
          </div>
        </dl>
      </section>

      <section className={card}>
        <h2 className="font-semibold">Who</h2>
        <ul className="list-disc pl-5 text-sm">
          {policy.subjects.map((s, i) => (
            <li key={i}>{subjectText(s, l)}</li>
          ))}
        </ul>
      </section>

      <section className={card}>
        <h2 className="font-semibold">What</h2>
        <ul className="list-disc pl-5 text-sm">
          {policy.targets.map((t, i) => (
            <li key={i}>{targetText(t, l)}</li>
          ))}
        </ul>
      </section>

      <section className={card}>
        <h2 className="font-semibold">Only when</h2>
        {policy.conditions.length === 0 ? (
          <p className="text-sm text-muted">Always (no conditions).</p>
        ) : (
          <ul className="list-disc pl-5 text-sm">
            {policy.conditions.map((c, i) => (
              <li key={i}>{conditionText(c, l)}</li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
