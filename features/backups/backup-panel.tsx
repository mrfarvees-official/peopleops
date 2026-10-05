"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface BackupRow {
  id: string;
  kind: "manual" | "pre_restore";
  scope: "tenant" | "platform";
  tenantName: string | null;
  createdAt: string;
  sizeBytes: number;
  rows: number;
  tables: number;
  note: string | null;
}

export interface BackupRights {
  create: boolean;
  platform: boolean;
  restore: boolean;
  remove: boolean;
  download: boolean;
}

interface TableReport {
  table: string;
  created: number;
  updated: number;
  errors: { row: number; message: string }[];
}
interface RestoreResult {
  applied: boolean;
  safetyBackupId: string | null;
  skippedTables: string[];
  tables: TableReport[];
}

const btn =
  "rounded border px-3 py-1 text-sm hover:bg-surface-2 disabled:opacity-50";
const field = "rounded border bg-surface p-2 text-sm";

const size = (n: number) =>
  n < 1024
    ? `${n} B`
    : n < 1048576
      ? `${(n / 1024).toFixed(1)} KB`
      : `${(n / 1048576).toFixed(1)} MB`;
const human = (key: string) =>
  key.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

export function BackupPanel({
  backups,
  rights,
  timezone,
}: {
  backups: BackupRow[];
  rights: BackupRights;
  timezone: string;
}) {
  const router = useRouter();
  const [scope, setScope] = useState<"tenant" | "platform">("tenant");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    id: string;
    result: RestoreResult;
  } | null>(null);

  const when = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone,
    }).format(new Date(iso));

  async function call(key: string, url: string, init: RequestInit) {
    setBusy(key);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(url, init);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const rows = (
          body.reports as { errors: { message: string }[] }[] | undefined
        )
          ?.flatMap((r) => r.errors)
          .slice(0, 3);
        throw new Error(
          [
            body.error ?? "Something went wrong",
            ...(rows?.map((r) => r.message) ?? []),
          ].join(": "),
        );
      }
      return body;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function create() {
    const body = await call("create", "/api/backups", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scope, note: note.trim() || undefined }),
    });
    if (body) {
      setNote("");
      setMessage("Backup created.");
      router.refresh();
    }
  }

  async function check(id: string) {
    const body = await call(
      `check-${id}`,
      `/api/backups/${id}/restore?mode=dry-run`,
      { method: "POST" },
    );
    if (body) setPreview({ id, result: body.restore });
  }

  async function restore(id: string) {
    if (
      !window.confirm(
        "Restore this backup? Missing or changed rows will be put back. A safety backup is taken first.",
      )
    )
      return;
    const body = await call(
      `restore-${id}`,
      `/api/backups/${id}/restore?mode=apply`,
      { method: "POST" },
    );
    if (body) {
      setPreview(null);
      setMessage(
        "Restored. A safety backup of the data before the restore was created.",
      );
      router.refresh();
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this backup file permanently?")) return;
    // the API answers 204 with no body, which call() reports as an empty object
    const done = await call(`del-${id}`, `/api/backups/${id}`, {
      method: "DELETE",
    });
    if (done) router.refresh();
  }

  const problems = preview
    ? preview.result.tables.flatMap((t) =>
        t.errors.map((e) => `${human(t.table)}: ${e.message}`),
      )
    : [];

  return (
    <section className="space-y-4 rounded border bg-surface p-4">
      <div>
        <h2 className="font-semibold">Backup and restore</h2>
        <p className="text-sm text-muted">
          A backup is a copy of your company data that you can put back later.
          Restoring brings back rows that are missing or were changed; rows
          added since the backup are kept. A safety backup is taken before every
          restore.
        </p>
      </div>

      {rights.create && (
        <div className="flex flex-wrap items-end gap-3">
          {rights.platform && (
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium text-muted">
                What to back up
              </span>
              <select
                className={field}
                value={scope}
                onChange={(e) =>
                  setScope(e.target.value as "tenant" | "platform")
                }
              >
                <option value="tenant">My company</option>
                <option value="platform">Whole platform (every company)</option>
              </select>
            </label>
          )}
          <label className="min-w-56 flex-1 text-sm">
            <span className="mb-1 block text-xs font-medium text-muted">
              Note (optional)
            </span>
            <input
              className={`${field} w-full`}
              maxLength={255}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Before year-end changes"
            />
          </label>
          <button
            type="button"
            className="rounded bg-accent px-4 py-2 text-sm text-accent-foreground disabled:opacity-60"
            disabled={busy === "create"}
            onClick={create}
          >
            {busy === "create" ? "Creating…" : "Create backup"}
          </button>
        </div>
      )}

      {message && <p className="text-sm text-success">{message}</p>}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded border">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2 text-muted">
            <tr>
              <th className="p-3">Created</th>
              <th className="p-3">Covers</th>
              <th className="p-3">Size</th>
              <th className="p-3">Note</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {backups.map((b) => (
              <tr key={b.id} className="border-t align-top">
                <td className="whitespace-nowrap p-3">{when(b.createdAt)}</td>
                <td className="p-3">
                  {b.scope === "platform"
                    ? "Whole platform"
                    : (b.tenantName ?? "Company")}
                  <span className="block text-xs text-muted">
                    {b.rows} rows in {b.tables} tables
                  </span>
                </td>
                <td className="whitespace-nowrap p-3">{size(b.sizeBytes)}</td>
                <td className="p-3">
                  {b.kind === "pre_restore" && (
                    <span className="mr-2 rounded border px-1.5 text-xs text-muted">
                      Safety copy
                    </span>
                  )}
                  {b.note ?? "—"}
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap justify-end gap-2">
                    {rights.download && (
                      <a
                        className={btn}
                        href={`/api/backups/${b.id}/download`}
                        download
                      >
                        Download
                      </a>
                    )}
                    {rights.restore && (
                      <button
                        type="button"
                        className={btn}
                        disabled={!!busy}
                        onClick={() => check(b.id)}
                      >
                        {busy === `check-${b.id}` ? "Checking…" : "Restore…"}
                      </button>
                    )}
                    {rights.remove && (
                      <button
                        type="button"
                        className={`${btn} text-danger`}
                        disabled={!!busy}
                        onClick={() => remove(b.id)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                  {preview?.id === b.id && (
                    <div className="mt-3 space-y-2 rounded border bg-background p-3 text-left text-sm">
                      <p className="font-medium">What a restore would do</p>
                      <ul className="space-y-1 text-xs">
                        {preview.result.tables
                          .filter(
                            (t) => t.created + t.updated + t.errors.length > 0,
                          )
                          .map((t) => (
                            <li key={t.table}>
                              {human(t.table)}: {t.created} added, {t.updated}{" "}
                              put back
                              {t.errors.length > 0 && (
                                <span className="text-danger">
                                  {" "}
                                  ({t.errors.length} problems)
                                </span>
                              )}
                            </li>
                          ))}
                      </ul>
                      {preview.result.skippedTables.length > 0 && (
                        <p className="text-xs text-muted">
                          Skipped (no longer supported):{" "}
                          {preview.result.skippedTables.join(", ")}
                        </p>
                      )}
                      {problems.length > 0 && (
                        <ul className="list-disc space-y-1 pl-5 text-xs text-danger">
                          {problems.slice(0, 5).map((p, i) => (
                            <li key={i}>{p}</li>
                          ))}
                        </ul>
                      )}
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className={btn}
                          onClick={() => setPreview(null)}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="rounded bg-accent px-3 py-1 text-sm text-accent-foreground disabled:opacity-50"
                          disabled={problems.length > 0 || !!busy}
                          onClick={() => restore(b.id)}
                        >
                          {busy === `restore-${b.id}`
                            ? "Restoring…"
                            : "Restore now"}
                        </button>
                      </div>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {backups.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted">
                  No backups yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
