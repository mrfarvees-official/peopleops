"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export interface RoleOption {
  code: string;
  name: string;
  description?: string;
}

interface Initial {
  id: string;
  email: string;
  displayName: string;
  status: "active" | "suspended" | "invited";
  roles: string[];
  version: number;
}

const field = "w-full rounded border bg-surface p-2 text-sm";
const label = "mb-1 block text-xs font-medium text-muted";

export function AccountForm({
  roles,
  initial,
  isSelf = false,
}: {
  roles: RoleOption[];
  initial?: Initial;
  isSelf?: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(initial?.email ?? "");
  const [displayName, setDisplayName] = useState(initial?.displayName ?? "");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"active" | "suspended">(
    initial?.status === "suspended" ? "suspended" : "active",
  );
  const [picked, setPicked] = useState<string[]>(initial?.roles ?? ["employee"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (code: string) =>
    setPicked((p) => (p.includes(code) ? p.filter((c) => c !== code) : [...p, code]));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = initial
      ? await fetch(`/api/accounts/${initial.id}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            displayName,
            status,
            roles: picked,
            password,
            version: initial.version,
          }),
        })
      : await fetch("/api/accounts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, displayName, status, roles: picked, password }),
        });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const issue = data.issues?.[0]?.message as string | undefined;
      setError(issue ?? data.error ?? "Could not save");
      setBusy(false);
      return;
    }
    router.push("/accounts");
    router.refresh();
  }

  return (
    <main className="mx-auto w-full max-w-xl space-y-4 p-6">
      <h1 className="text-2xl font-bold">{initial ? "Edit account" : "New account"}</h1>
      <form onSubmit={submit} className="space-y-4 rounded border bg-surface p-4">
        <div>
          <label className={label} htmlFor="displayName">
            Name
          </label>
          <input
            id="displayName"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className={field}
          />
        </div>
        <div>
          <label className={label} htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            disabled={!!initial}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={field}
          />
          {initial && (
            <p className="mt-1 text-xs text-muted">
              The email is the sign-in name and cannot be changed.
            </p>
          )}
        </div>
        <div>
          <label className={label} htmlFor="password">
            {initial ? "New password (leave empty to keep the current one)" : "Password"}
          </label>
          <input
            id="password"
            type="password"
            required={!initial}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={field}
          />
          <p className="mt-1 text-xs text-muted">
            At least 10 characters, with letters and a number.
          </p>
        </div>
        <div>
          <label className={label} htmlFor="status">
            Status
          </label>
          <select
            id="status"
            value={status}
            disabled={isSelf}
            onChange={(e) => setStatus(e.target.value as "active" | "suspended")}
            className={field}
          >
            <option value="active">Active</option>
            <option value="suspended">Suspended (cannot sign in)</option>
          </select>
        </div>
        <fieldset>
          <legend className={label}>Roles</legend>
          <div className="space-y-2">
            {roles.map((r) => (
              <label key={r.code} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={picked.includes(r.code)}
                  onChange={() => toggle(r.code)}
                  className="mt-1"
                />
                <span>
                  {r.name}
                  {r.description && (
                    <span className="block text-xs text-muted">{r.description}</span>
                  )}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {error && (
          <p role="alert" className="rounded border border-danger p-3 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={busy || picked.length === 0}
            className="rounded bg-accent px-4 py-2 text-sm text-accent-foreground disabled:opacity-60"
          >
            {busy ? "Saving…" : initial ? "Save changes" : "Create account"}
          </button>
          <Link href="/accounts" className="rounded border px-4 py-2 text-sm hover:bg-surface-2">
            Cancel
          </Link>
        </div>
      </form>
    </main>
  );
}
