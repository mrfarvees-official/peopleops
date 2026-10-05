import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuditAccess } from "@/features/audit-log/access";
import {
  formatWhen,
  humanize,
  outcomeClass,
  outcomeLabel,
} from "@/features/audit-log/format";
import { AccessDenied } from "@/features/pbac/access-denied";
import { getAuditQuery } from "@/server/audit-query";
import { requestInfo } from "@/server/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit entry" };

const card = "space-y-2 rounded border bg-surface p-4";

const json = (v: unknown) => JSON.stringify(v, null, 2);

export default async function AuditEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAuditAccess("view");
  if (!user) return <AccessDenied what="view the audit log" />;

  const { id } = await params;
  const ctx = await requestInfo();
  const query = getAuditQuery();
  const entry = await query.get(user, id, ctx).catch((e) => {
    if ((e as Error)?.name === "AuditEntryNotFoundError") notFound();
    throw e;
  });
  const options = await query.options(user, ctx);
  const find = (list: { value: string; label: string }[], v: string | null) =>
    (v && list.find((o) => o.value === v)?.label) || v || "—";

  const rows: [string, React.ReactNode][] = [
    ["When", formatWhen(entry.occurredAt)],
    ["Person", entry.actorId ? find(options.actors, entry.actorId) : "System"],
    ["Company", find(options.tenants, entry.tenantId)],
    ["Action", humanize(entry.action)],
    ["Record type", humanize(entry.resourceType)],
    ["Record ID", entry.resourceId ?? "—"],
    [
      "Result",
      <span key="o" className={outcomeClass(entry.outcome)}>
        {outcomeLabel(entry.outcome)}
      </span>,
    ],
    ["Reason", entry.reason ?? "—"],
    ["IP address", entry.ip ?? "—"],
    ["Request ID", entry.requestId ?? "—"],
  ];

  return (
    <main className="mx-auto w-full max-w-4xl space-y-4 p-6">
      <div>
        <Link href="/audit" className="text-sm text-muted hover:underline">
          ← Audit log
        </Link>
        <h1 className="text-2xl font-bold">
          {humanize(entry.action)} · {humanize(entry.resourceType)}
        </h1>
      </div>

      <dl className="divide-y rounded border bg-surface text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-3 gap-3 p-3">
            <dt className="text-muted">{k}</dt>
            <dd className="col-span-2 break-words">{v}</dd>
          </div>
        ))}
      </dl>

      {(["before", "after"] as const).map((k) =>
        entry[k] ? (
          <section key={k} className={card}>
            <h2 className="font-semibold">
              {k === "before" ? "Before" : "After"}
            </h2>
            <pre className="overflow-auto rounded bg-background p-3 text-xs">
              {json(entry[k])}
            </pre>
          </section>
        ) : null,
      )}
    </main>
  );
}
