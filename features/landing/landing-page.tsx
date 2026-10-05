import Link from "next/link";
import { DEMO_ACCOUNTS } from "./demo-accounts";

const FEATURES = [
  ["Employees & org", "Profiles, org units and reporting lines, with sensitive fields masked."],
  ["Leave & attendance", "Requests, approvals, clock-in and 90 days of history."],
  ["Payroll", "Monthly runs, payslips and a publish workflow."],
  ["Recruitment", "Candidate pipeline from applied to hired."],
  ["Permissions (PBAC)", "Every action is checked against policies, per role and per company."],
  ["Audit, import & backup", "Who changed what, CSV/JSON transfer and restorable backups."],
] as const;

const STEPS = [
  "Pick a role from the list below and click Sign in as. The email and password are filled in for you.",
  "Press Sign in, then explore the dashboard and the HR menu.",
  "Sign out and try a different role. Notice how menus, buttons and data change.",
  "Sign in as the Auditor and open the Audit log to see every action you just took.",
] as const;

export function LandingPage({ password }: { password?: string }) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-16 px-6 py-16">
      <header className="flex flex-col gap-5">
        <p className="text-sm font-medium text-accent">Live demo</p>
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight">
          PeopleOps, an HR and people operations platform
        </h1>
        <p className="max-w-2xl text-lg text-muted">
          A multi-company HR system with role-based access on every action. No
          sign-up needed: use one of the {DEMO_ACCOUNTS.length} demo accounts
          below to see the product as that person would.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/login"
            className="rounded-full bg-accent px-5 py-3 font-medium text-accent-foreground"
          >
            Sign in
          </Link>
          <a href="#accounts" className="rounded-full border px-5 py-3 font-medium">
            See demo accounts
          </a>
        </div>
      </header>

      <section aria-labelledby="how" className="flex flex-col gap-4">
        <h2 id="how" className="text-2xl font-semibold">How to try it</h2>
        <ol className="grid gap-3 sm:grid-cols-2">
          {STEPS.map((s, i) => (
            <li key={s} className="flex gap-3 rounded-lg border bg-surface p-4">
              <span className="font-semibold text-accent">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="accounts-title" id="accounts" className="flex flex-col gap-4">
        <h2 id="accounts-title" className="text-2xl font-semibold">
          Demo accounts ({DEMO_ACCOUNTS.length})
        </h2>
        <p className="text-muted">
          All accounts belong to one sample company with 38 employees and two
          years of generated HR history.{" "}
          {password ? (
            <>
              Password for every account:{" "}
              <code className="rounded bg-surface px-2 py-1 font-mono">{password}</code>
            </>
          ) : (
            "Ask the project owner for the demo password."
          )}
        </p>
        <ul className="grid gap-3 md:grid-cols-2">
          {DEMO_ACCOUNTS.map((a) => (
            <li key={a.role} className="flex flex-col gap-2 rounded-lg border bg-surface p-4">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-semibold">{a.roleName}</h3>
                <span className="text-sm text-muted">{a.name}</span>
              </div>
              <p className="text-sm text-muted">{a.tryThis}</p>
              <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                <div className="flex flex-col text-sm">
                  <span className="text-muted">
                    Email: <code className="font-mono text-foreground">{a.email}</code>
                  </span>
                  {password && (
                    <span className="text-muted">
                      Password: <code className="font-mono text-foreground">{password}</code>
                    </span>
                  )}
                </div>
                <Link
                  href={`/login?email=${encodeURIComponent(a.email)}`}
                  className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground"
                >
                  Sign in as
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="features" className="flex flex-col gap-4">
        <h2 id="features" className="text-2xl font-semibold">What is inside</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(([title, text]) => (
            <li key={title} className="rounded-lg border p-4">
              <h3 className="font-semibold">{title}</h3>
              <p className="text-sm text-muted">{text}</p>
            </li>
          ))}
        </ul>
      </section>

      <footer className="text-sm text-muted">PeopleOps · demo environment, data is sample data.</footer>
    </main>
  );
}
