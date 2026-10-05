"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FieldDef } from "@/platform/domain/hr";
import type { Options } from "./format";

type Values = Record<string, string | boolean>;

const input = "w-full rounded border bg-surface p-2 text-sm";
const label = "mb-1 block text-xs font-medium text-muted";

const today = () => new Date().toISOString().slice(0, 10);

/** ISO timestamp -> value for <input type="datetime-local"> in the browser's own zone. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function initialValues(
  fields: FieldDef[],
  record?: Record<string, unknown>,
): Values {
  const out: Values = {};
  for (const f of fields) {
    const v = record?.[f.key];
    if (record) {
      out[f.key] =
        f.type === "bool"
          ? Boolean(v)
          : v == null
            ? ""
            : f.type === "datetime"
              ? toLocalInput(String(v))
              : String(v);
      continue;
    }
    // sensible starting values for a new record
    if (f.type === "bool") out[f.key] = !["isArchived"].includes(f.key);
    else if (f.type === "select" && f.required)
      out[f.key] = f.options?.[0]?.value ?? "";
    else if (
      f.type === "date" &&
      f.required &&
      ["date", "appliedAt"].includes(f.key)
    )
      out[f.key] = today();
    else out[f.key] = "";
  }
  return out;
}

export function ModuleForm({
  module,
  singular,
  fields,
  options,
  mode,
  recordId,
  record,
}: {
  module: string;
  singular: string;
  /** Only the fields a person can fill in (read-only and display fields are left out). */
  fields: FieldDef[];
  options: Options;
  mode: "create" | "edit";
  recordId?: string;
  record?: Record<string, unknown>;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(() =>
    initialValues(fields, record),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const set = (key: string, v: string | boolean) =>
    setValues((p) => ({ ...p, [key]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});

    const body: Record<string, unknown> = {};
    for (const f of fields) {
      const v = values[f.key];
      if (f.type === "datetime" && typeof v === "string" && v)
        body[f.key] = new Date(v).toISOString();
      else body[f.key] = v;
    }

    const res = await fetch(
      mode === "create" ? `/api/hr/${module}` : `/api/hr/${module}/${recordId}`,
      {
        method: mode === "create" ? "POST" : "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const issues: { field?: string; message: string }[] = data.issues ?? [];
      const perField: Record<string, string> = {};
      for (const i of issues) if (i.field) perField[i.field] = i.message;
      setFieldErrors(perField);
      setError(data.error ?? "Could not save");
      setBusy(false);
      return;
    }
    router.push(`/hr/${module}/${data.record.id}`);
    router.refresh();
  }

  const shown = fields.filter(
    (f) => f.type !== "ref" || f.required || (options[f.ref!]?.length ?? 0) > 0,
  );

  return (
    <form onSubmit={submit} className="mx-auto w-full max-w-3xl space-y-4 p-6">
      <h1 className="text-2xl font-bold">
        {mode === "create"
          ? `New ${singular.toLowerCase()}`
          : `Edit ${singular.toLowerCase()}`}
      </h1>

      <div className="grid gap-4 rounded border bg-surface p-4 md:grid-cols-2">
        {shown.map((f) => {
          const wide = f.type === "textarea";
          const v = values[f.key];
          const err = fieldErrors[f.key];
          return (
            <div key={f.key} className={wide ? "md:col-span-2" : ""}>
              {f.type === "bool" ? (
                <label className="flex items-center gap-2 pt-6 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(v)}
                    onChange={(e) => set(f.key, e.target.checked)}
                  />
                  {f.label}
                </label>
              ) : (
                <>
                  <label className={label} htmlFor={f.key}>
                    {f.label}
                    {f.required && <span className="text-danger"> *</span>}
                  </label>
                  {f.type === "textarea" ? (
                    <textarea
                      id={f.key}
                      className={`${input} h-24`}
                      maxLength={f.max}
                      value={String(v)}
                      onChange={(e) => set(f.key, e.target.value)}
                    />
                  ) : f.type === "select" ? (
                    <select
                      id={f.key}
                      className={input}
                      required={f.required}
                      value={String(v)}
                      onChange={(e) => set(f.key, e.target.value)}
                    >
                      {!f.required && <option value="">—</option>}
                      {f.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : f.type === "ref" ? (
                    <select
                      id={f.key}
                      className={input}
                      required={f.required}
                      value={String(v)}
                      onChange={(e) => set(f.key, e.target.value)}
                    >
                      <option value="">{f.required ? "Choose…" : "—"}</option>
                      {options[f.ref!]?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={f.key}
                      className={input}
                      required={f.required}
                      maxLength={f.type === "text" ? f.max : undefined}
                      type={
                        f.type === "email"
                          ? "email"
                          : f.type === "phone"
                            ? "tel"
                            : f.type === "date"
                              ? "date"
                              : f.type === "datetime"
                                ? "datetime-local"
                                : f.type === "number" || f.type === "money"
                                  ? "number"
                                  : "text"
                      }
                      step={
                        f.type === "money"
                          ? "0.01"
                          : f.type === "number"
                            ? "any"
                            : undefined
                      }
                      min={f.min}
                      max={
                        f.type === "number" || f.type === "money"
                          ? f.max
                          : undefined
                      }
                      value={String(v)}
                      onChange={(e) => set(f.key, e.target.value)}
                    />
                  )}
                </>
              )}
              {f.help && <p className="mt-1 text-xs text-muted">{f.help}</p>}
              {err && <p className="mt-1 text-xs text-danger">{err}</p>}
            </div>
          );
        })}
      </div>

      {error && (
        <p
          role="alert"
          className="rounded border border-danger p-3 text-sm text-danger"
        >
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-accent px-4 py-2 text-accent-foreground disabled:opacity-60"
        >
          {busy ? "Saving…" : mode === "create" ? "Create" : "Save changes"}
        </button>
        <button
          type="button"
          className="rounded border px-4 py-2 hover:bg-surface-2"
          onClick={() => router.back()}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
