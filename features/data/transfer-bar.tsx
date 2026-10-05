"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

interface RowError {
  row: number;
  message: string;
}
interface Report {
  total: number;
  created: number;
  updated: number;
  errors: RowError[];
  applied: boolean;
}

const btn = "rounded border px-3 py-1 text-sm hover:bg-surface-2";

/**
 * Export (download as JSON or CSV) and Import (check a file, then apply it) for
 * one table. Each part appears only if the caller may use it.
 */
export function TransferBar({
  table,
  label,
  canExport,
  canImport,
}: {
  table: string;
  label: string;
  canExport: boolean;
  canImport: boolean;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<{
    name: string;
    text: string;
    format: "json" | "csv";
  } | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const base = `/api/data/tables/${table}`;

  function reset() {
    setFile(null);
    setReport(null);
    setError(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function choose(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    reset();
    if (!f) return;
    if (!/\.(json|csv)$/i.test(f.name)) {
      setError("Choose a .json or .csv file");
      return;
    }
    const picked = {
      name: f.name,
      text: await f.text(),
      format: /\.csv$/i.test(f.name) ? ("csv" as const) : ("json" as const),
    };
    setFile(picked);
    await send(picked, "dry-run");
  }

  async function send(f: NonNullable<typeof file>, mode: "dry-run" | "apply") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `${base}/import?mode=${mode}&format=${f.format}`,
        {
          method: "POST",
          headers: {
            "content-type":
              f.format === "csv" ? "text/csv" : "application/json",
          },
          body: f.text,
        },
      );
      const body = await res.json().catch(() => ({}));
      // A refused apply still carries a per-row report.
      const r: Report | undefined = body.report ?? body.reports?.[0];
      if (r) setReport(r);
      if (!res.ok && !r) throw new Error(body.error ?? "The import failed");
      if (res.ok && mode === "apply") {
        router.refresh();
        setOpen(false);
        reset();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "The import failed");
    } finally {
      setBusy(false);
    }
  }

  if (!canExport && !canImport) return null;
  const clean = report && report.errors.length === 0;

  return (
    <div className="relative flex items-center gap-2">
      {canExport && (
        <span className="inline-flex overflow-hidden rounded border">
          <span className="px-3 py-1 text-sm text-muted">Export</span>
          <a
            className="border-l px-3 py-1 text-sm hover:bg-surface-2"
            href={`${base}/export?format=csv`}
            download
          >
            CSV
          </a>
          <a
            className="border-l px-3 py-1 text-sm hover:bg-surface-2"
            href={`${base}/export?format=json`}
            download
          >
            JSON
          </a>
        </span>
      )}
      {canImport && (
        <button
          type="button"
          className={btn}
          onClick={() => (setOpen((o) => !o), reset())}
        >
          Import
        </button>
      )}

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-[26rem] max-w-[90vw] space-y-3 rounded border bg-surface p-4 shadow-lg">
          <div>
            <p className="font-medium">Import {label.toLowerCase()}</p>
            <p className="text-xs text-muted">
              Use a file exported from here (CSV or JSON). Rows are matched by
              their id: existing rows are updated, new ones are added. Nothing
              is saved until the check passes and you confirm.
            </p>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept=".json,.csv"
            onChange={choose}
            className="w-full text-sm"
          />

          {busy && <p className="text-sm text-muted">Working…</p>}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}

          {report && (
            <div className="space-y-2 text-sm">
              <p>
                <strong>{report.total}</strong> rows in {file?.name}:{" "}
                <strong>{report.created}</strong> new,{" "}
                <strong>{report.updated}</strong> updated.
              </p>
              {report.errors.length > 0 && (
                <div>
                  <p className="text-danger">
                    Fix these before importing (nothing was saved):
                  </p>
                  <ul className="mt-1 max-h-40 list-disc space-y-1 overflow-auto pl-5 text-xs">
                    {report.errors.map((e, i) => (
                      <li key={i}>
                        {e.row > 0 ? `Row ${e.row}: ` : ""}
                        {e.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {clean && <p className="text-success">The file is valid.</p>}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={btn}
              onClick={() => (setOpen(false), reset())}
            >
              Close
            </button>
            <button
              type="button"
              disabled={!clean || busy || !file}
              onClick={() => file && send(file, "apply")}
              className="rounded bg-accent px-3 py-1 text-sm text-accent-foreground disabled:opacity-50"
            >
              Import {report?.total ?? ""} rows
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
