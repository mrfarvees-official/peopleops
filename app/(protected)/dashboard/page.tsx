import Link from "next/link";
import { ActionButton } from "@/features/hr/action-button";
import { clock } from "@/features/hr/format";
import { getInsights } from "@/server/hr";
import { requestInfo, requireUser } from "@/server/session";
import { getTenantInfo } from "@/server/tenant";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

const card = "rounded border bg-surface p-4";

function Tile({
  label,
  value,
  href,
  hint,
}: {
  label: string;
  value: number | string;
  href?: string;
  hint?: string;
}) {
  const body = (
    <div className={`${card} h-full ${href ? "hover:bg-surface-2" : ""}`}>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default async function Page() {
  const user = await requireUser();
  const [d, tenant] = await Promise.all([
    getInsights().dashboard(user, await requestInfo()),
    getTenantInfo(user.tenantId),
  ]);
  const locale = { timezone: tenant.timezone, currency: tenant.currency };
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">
          {greeting}, {user.displayName.split(" ")[0]}
        </h1>
        <p className="text-sm text-muted">
          {d.employee?.jobTitle ? `${d.employee.jobTitle} · ` : ""}
          {tenant.name}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {d.canClock && (
          <div className={`${card} sm:col-span-2`}>
            <p className="text-sm text-muted">Today</p>
            {d.today?.clockIn ? (
              <p className="mt-1 text-lg">
                In at <strong>{clock(d.today.clockIn, locale)}</strong>
                {d.today.clockOut ? (
                  <>
                    {" "}
                    · Out at <strong>{clock(d.today.clockOut, locale)}</strong>
                  </>
                ) : null}
              </p>
            ) : (
              <p className="mt-1 text-lg text-muted">
                You have not clocked in yet.
              </p>
            )}
            <div className="mt-3">
              {!d.today?.clockIn ? (
                <ActionButton
                  module="attendance"
                  action="clock-in"
                  label="Clock in"
                  tone="primary"
                />
              ) : !d.today.clockOut ? (
                <ActionButton
                  module="attendance"
                  action="clock-out"
                  label="Clock out"
                  tone="primary"
                />
              ) : (
                <span className="text-sm text-success">Done for today</span>
              )}
            </div>
          </div>
        )}
        {d.pendingApprovals !== null && (
          <Tile
            label="Leave waiting for approval"
            value={d.pendingApprovals}
            href="/hr/leave-requests?status=submitted"
          />
        )}
        {d.headcount !== null && (
          <Tile
            label="Active employees"
            value={d.headcount}
            href="/hr/employees"
          />
        )}
        {d.openCandidates !== null && (
          <Tile
            label="Open candidates"
            value={d.openCandidates}
            href="/hr/candidates"
          />
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {d.balances.length > 0 && (
          <section className={card}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">My leave this year</h2>
              <Link
                href="/hr/leave-requests/new"
                className="text-sm text-accent hover:underline"
              >
                Request leave
              </Link>
            </div>
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th className="pb-2">Type</th>
                  <th className="pb-2 text-right">Allowance</th>
                  <th className="pb-2 text-right">Taken</th>
                  <th className="pb-2 text-right">Waiting</th>
                  <th className="pb-2 text-right">Left</th>
                </tr>
              </thead>
              <tbody>
                {d.balances.map((b) => (
                  <tr key={b.type} className="border-t">
                    <td className="py-2">{b.type}</td>
                    <td className="py-2 text-right">
                      {b.allowance > 0 ? b.allowance : "No limit"}
                    </td>
                    <td className="py-2 text-right">{b.used}</td>
                    <td className="py-2 text-right">{b.pending}</td>
                    <td className="py-2 text-right font-medium">
                      {b.allowance > 0
                        ? Math.max(0, b.allowance - b.used - b.pending)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {d.upcomingLeave && (
          <section className={card}>
            <h2 className="mb-3 font-semibold">Upcoming leave</h2>
            {d.upcomingLeave.length === 0 ? (
              <p className="text-sm text-muted">Nobody is away soon.</p>
            ) : (
              <ul className="divide-y text-sm">
                {d.upcomingLeave.map((u, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between py-2"
                  >
                    <span>
                      <strong>{u.employee}</strong> · {u.type}
                    </span>
                    <span className="text-muted">
                      {u.start}
                      {u.end !== u.start ? ` to ${u.end}` : ""} ({u.days}d)
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      {!d.employee && d.pendingApprovals === null && d.headcount === null && (
        <p className="text-sm text-muted">
          Use the menu on the left to get started.
        </p>
      )}
    </main>
  );
}
