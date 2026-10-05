import { AccessDenied } from "@/features/pbac/access-denied";
import { isForbidden } from "@/features/hr/module-data";
import { money } from "@/features/hr/format";
import { getInsights } from "@/server/hr";
import { requestInfo, requireUser } from "@/server/session";
import { getTenantInfo } from "@/server/tenant";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reports" };

const card = "space-y-3 rounded border bg-surface p-4";

/** Horizontal bars: width is each row's share of the largest value. */
function Bars({
  rows,
  unit = "",
}: {
  rows: { label: string; value: number }[];
  unit?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0)
    return <p className="text-sm text-muted">No data yet.</p>;
  return (
    <ul className="space-y-2 text-sm">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mb-1 flex justify-between">
            <span>{r.label}</span>
            <span className="text-muted">
              {r.value}
              {unit}
            </span>
          </div>
          <div className="h-2 rounded bg-surface-2">
            <div
              className="h-2 rounded bg-accent"
              style={{ width: `${(r.value / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default async function ReportsPage() {
  const user = await requireUser();
  let report;
  try {
    report = await getInsights().reports(user, await requestInfo());
  } catch (e) {
    if (isForbidden(e)) return <AccessDenied what="view reports" />;
    throw e;
  }
  const tenant = await getTenantInfo(user.tenantId);
  const locale = { timezone: tenant.timezone, currency: tenant.currency };
  const { headcount, leave, attendance, recruitment, payroll } = report;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-sm text-muted">
          Figures for {tenant.name}. You only see the sections your role allows.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {headcount && (
          <section className={card}>
            <h2 className="font-semibold">
              Headcount: {headcount.total} active employees
            </h2>
            <div>
              <h3 className="mb-2 text-sm text-muted">By org unit</h3>
              <Bars
                rows={headcount.byOrgUnit.map((r) => ({
                  label: r.label,
                  value: r.count,
                }))}
              />
            </div>
            <div>
              <h3 className="mb-2 text-sm text-muted">By employment type</h3>
              <Bars
                rows={headcount.byType.map((r) => ({
                  label: r.label,
                  value: r.count,
                }))}
              />
            </div>
          </section>
        )}

        {leave && (
          <section className={card}>
            <h2 className="font-semibold">Approved leave in {leave.year}</h2>
            <Bars
              rows={leave.byType.map((r) => ({
                label: `${r.label} (${r.requests} requests)`,
                value: r.days,
              }))}
              unit=" days"
            />
            <div>
              <h3 className="mb-2 text-sm text-muted">Requests by status</h3>
              <Bars
                rows={leave.byStatus.map((r) => ({
                  label: r.label,
                  value: r.count,
                }))}
              />
            </div>
          </section>
        )}

        {attendance && (
          <section className={card}>
            <h2 className="font-semibold">Attendance, last 30 days</h2>
            <p className="text-sm text-muted">
              {attendance.records} records · average {attendance.averageHours}{" "}
              hours a day ({attendance.from} to {attendance.to})
            </p>
            <Bars
              rows={attendance.byStatus.map((r) => ({
                label: r.label,
                value: r.count,
              }))}
            />
          </section>
        )}

        {recruitment && (
          <section className={card}>
            <h2 className="font-semibold">Recruitment pipeline</h2>
            <Bars
              rows={recruitment.map((r) => ({
                label: r.label,
                value: r.count,
              }))}
            />
          </section>
        )}
      </div>

      {payroll && (
        <section className={card}>
          <h2 className="font-semibold">Payroll, recent runs</h2>
          {payroll.length === 0 ? (
            <p className="text-sm text-muted">No payroll runs yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-muted">
                  <tr>
                    <th className="pb-2">Period</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2 text-right">Employees</th>
                    <th className="pb-2 text-right">Gross</th>
                    <th className="pb-2 text-right">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {payroll.map((r) => (
                    <tr key={r.period} className="border-t">
                      <td className="py-2">{r.period}</td>
                      <td className="py-2 capitalize">{r.status}</td>
                      <td className="py-2 text-right">{r.employees}</td>
                      <td className="py-2 text-right">
                        {money(r.gross, locale)}
                      </td>
                      <td className="py-2 text-right">
                        {money(r.net, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {!headcount && !leave && !attendance && !recruitment && !payroll && (
        <p className="text-sm text-muted">Your role has no report sections.</p>
      )}
    </main>
  );
}
