"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface SettingFieldProps {
  settingKey: string;
  label: string;
  description: string;
  type: "flag" | "integer" | "text";
  value: number | string;
  isDefault: boolean;
  canEdit: boolean;
}

/** One platform setting: a switch for flags, an input with Save for the rest. */
export function SettingField(p: SettingFieldProps) {
  const router = useRouter();
  const [value, setValue] = useState<number | string>(p.value);
  const [saved, setSaved] = useState<number | string>(p.value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: number | string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/settings/${encodeURIComponent(p.settingKey)}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ value: next }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Could not save");
      setValue(body.setting.value);
      setSaved(body.setting.value);
      router.refresh();
    } catch (e) {
      setValue(saved); // put the control back to what is actually stored
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  const on = value === 1;

  return (
    <div className="space-y-2 rounded border p-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium">{p.label}</p>
          <p className="text-sm text-muted">{p.description}</p>
        </div>

        {p.type === "flag" && (
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label={p.label}
            disabled={!p.canEdit || busy}
            onClick={() => save(on ? 0 : 1)}
            className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors disabled:opacity-50 ${
              on ? "bg-accent" : "bg-surface-2"
            }`}
          >
            <span
              className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-background transition-all ${
                on ? "left-5.5" : "left-0.5"
              }`}
            />
          </button>
        )}
      </div>

      {p.type !== "flag" && (
        <div className="flex gap-2">
          <input
            className="w-full rounded border bg-surface p-2 text-sm"
            type={p.type === "integer" ? "number" : "text"}
            value={value}
            disabled={!p.canEdit || busy}
            onChange={(e) =>
              setValue(
                p.type === "integer" ? Number(e.target.value) : e.target.value,
              )
            }
          />
          {p.canEdit && (
            <button
              type="button"
              disabled={busy || value === saved}
              onClick={() => save(value)}
              className="rounded bg-accent px-4 py-2 text-sm text-accent-foreground disabled:opacity-50"
            >
              Save
            </button>
          )}
        </div>
      )}

      <p className="text-xs text-muted" aria-live="polite">
        {busy
          ? "Saving…"
          : [
              p.type === "flag" ? (on ? "On (1)" : "Off (0)") : null,
              !p.canEdit ? "View only" : null,
            ]
              .filter(Boolean)
              .join(" · ")}
      </p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
