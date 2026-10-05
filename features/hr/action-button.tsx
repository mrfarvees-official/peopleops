"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface ActionButtonProps {
  module: string;
  /** Record the step applies to; omit for steps like clock in. */
  id?: string;
  action: string;
  label: string;
  note?: "optional" | "required" | null;
  tone?: "primary" | "danger" | null;
  /** "restore" and "delete" use their own endpoints. */
  kind?: "step" | "restore" | "delete";
  confirm?: string;
  redirectTo?: string;
}

const toneClass = {
  primary: "bg-accent text-accent-foreground border-transparent",
  danger: "text-danger hover:bg-surface-2",
  none: "hover:bg-surface-2",
} as const;

/** One workflow step: asks for a note when the step wants one, calls the API, refreshes. */
export function ActionButton(p: ActionButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    let note: string | undefined;
    if (p.note) {
      const answer = window.prompt(
        `${p.label}: ${p.note === "required" ? "add a note (required)" : "add a note (optional)"}`,
        "",
      );
      if (answer === null) return; // cancelled
      if (p.note === "required" && !answer.trim()) {
        setError("A note is required");
        return;
      }
      note = answer.trim() || undefined;
    } else if (p.confirm && !window.confirm(p.confirm)) {
      return;
    }

    setBusy(true);
    setError(null);
    const base = `/api/hr/${p.module}`;
    const url =
      p.kind === "delete"
        ? `${base}/${p.id}`
        : p.kind === "restore"
          ? `${base}/${p.id}/restore`
          : p.id
            ? `${base}/${p.id}/${p.action}`
            : `${base}/actions/${p.action}`;
    const res = await fetch(url, {
      method: p.kind === "delete" ? "DELETE" : "POST",
      headers: { "content-type": "application/json" },
      body:
        p.kind === "delete" || p.kind === "restore"
          ? undefined
          : JSON.stringify({ note }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong");
      setBusy(false);
      return;
    }
    if (p.redirectTo) router.push(p.redirectTo);
    router.refresh();
    setBusy(false);
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={go}
        disabled={busy}
        className={`rounded border px-3 py-1 text-sm disabled:opacity-60 ${toneClass[p.tone ?? "none"]}`}
      >
        {busy ? "Working…" : p.label}
      </button>
      {error && (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      )}
    </span>
  );
}
