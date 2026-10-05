import Link from "next/link";
import { requireAuditAccess } from "@/features/audit-log/access";
import {
  formatWhen,
  humanize,
  outcomeClass,
  outcomeLabel,
} from "@/features/audit-log/format";
import { TableTransfer } from "@/features/data/table-transfer";
import { AccessDenied } from "@/features/pbac/access-denied";
import { getAuditQuery } from "@/server/audit-query";
import { requestInfo } from "@/server/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit log" };

const SIZES = [25, 50, 100] as const;
const FILTER_KEYS = [
  "tenantId",
  "actorId",
  "action",
  "resourceType",
  "outcome",
  "from",
  "to",
] as const;

type Params = Record<string, string | undefined>;

const field = "w-full rounded border bg-surface p-2 text-sm";
const label = "mb-1 block text-xs font-medium text-muted";

function Select({
  name,
  title,
  value,
  options,
  any,
}: {
  name: string;
  title: string;
  value?: string;
  options: { value: string; label: string }[];
  any: string;
}) {
  return (
    <div>
      <label className={label} htmlFor={name}>
        {title}
      </label>
      <select
        id={name}
        name={name}
        defaultValue={value ?? ""}
        className={field}
      >
        <option value="">{any}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const user = await requireAuditAccess("viewAny");
  if (!user) return <AccessDenied what="view the audit log" />;

  const sp = await searchParams;
  const ctx = await requestInfo();
  const query = getAuditQuery();
  const [data, options] = await Promise.all([
    query.list(user, sp, ctx),
    query.options(user, ctx),
  ]);
  const { rows, total, page, size } = data;

  const name = (list: { value: string; label: string }[], v: string | null) =>
    (v && list.find((o) => o.value === v)?.label) || v || "—";
  const actorName = (id: string | null) =>
    id ? name(options.actors, id).replace(/ \(.*\)$/, "") : "System";

  // Links keep the active filters and change only the page or page size.
  const href = (p: number, s: number) => {
    const q = new URLSearchParams();
    for (const k of FILTER_KEYS) if (sp[k]) q.set(k, sp[k]!);
    q.set("size", String(s));
    q.set("page", String(p));
    return `/audit?${q}`;
  };
  const pages = Math.max(1, Math.ceil(total / size));
  const first = (page - 1) * size;
  const filtered = FILTER_KEYS.some((k) => sp[k]);

  return (
    <main className="flex h-full min-h-96 w-full flex-col p-6">
      <div className="mb-4 flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Audit log</h1>
          <p className="text-sm text-muted">
            Who did what, and when. Entries cannot be edited or deleted.
          </p>
        </div>
        <TableTransfer
          user={user}
          table="audit-log"
          label="Audit log"
          ctx={ctx}
        />
      </div>

      <form
        method="get"
        className="mb-4 grid shrink-0 gap-3 rounded border bg-surface p-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <Select
          name="tenantId"
          title="Company"
          value={sp.tenantId}
          options={options.tenants}
          any="All companies"
        />
        <Select
          name="actorId"
          title="Person"
          value={sp.actorId}
          options={options.actors}
          any="Anyone"
        />
        <Select
          name="action"
          title="Action"
          value={sp.action}
          options={options.actions}
          any="Any action"
        />
        <Select
          name="resourceType"
          title="Record type"
          value={sp.resourceType}
          options={options.resources}
          any="Any record"
        />
        <Select
          name="outcome"
          title="Result"
          value={sp.outcome}
          options={options.outcomes}
          any="Any result"
        />
        <div>
          <label className={label} htmlFor="from">
            From
          </label>
          <input
            id="from"
            name="from"
            type="date"
            defaultValue={sp.from}
            className={field}
          />
        </div>
        <div>
          <label className={label} htmlFor="to">
            To
          </label>
          <input
            id="to"
            name="to"
            type="date"
            defaultValue={sp.to}
            className={field}
          />
        </div>
        <input type="hidden" name="size" value={size} />
        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="rounded bg-accent px-4 py-2 text-sm text-accent-foreground"
          >
            Apply
          </button>
          {filtered && (
            <Link
              href={`/audit?size=${size}`}
              className="rounded border px-4 py-2 text-sm hover:bg-surface-2"
            >
              Reset
            </Link>
          )}
        </div>
      </form>

      {/* Only this box scrolls; the title, filters and pager stay put. */}
      <div className="min-h-0 flex-1 overflow-auto rounded border">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-surface text-muted shadow-[0_1px_0_var(--border)]">
            <tr>
              <th className="p-3">When</th>
              <th className="p-3">Person</th>
              <th className="p-3">Action</th>
              <th className="p-3">Record</th>
              <th className="p-3">Result</th>
              <th className="p-3">Company</th>
              <th className="p-3 text-right">Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="whitespace-nowrap p-3">
                  {formatWhen(r.occurredAt)}
                </td>
                <td className="p-3">{actorName(r.actorId)}</td>
                <td className="p-3">{humanize(r.action)}</td>
                <td className="p-3">{humanize(r.resourceType)}</td>
                <td className={`p-3 ${outcomeClass(r.outcome)}`}>
                  {outcomeLabel(r.outcome)}
                </td>
                <td className="p-3">{name(options.tenants, r.tenantId)}</td>
                <td className="p-3 text-right">
                  <Link
                    href={`/audit/${r.id}`}
                    className="rounded border px-3 py-1 hover:bg-surface-2"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted">
                  No entries match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex shrink-0 flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-muted">
          {total === 0
            ? "0 entries"
            : `Showing ${first + 1}–${first + rows.length} of ${total}`}
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
