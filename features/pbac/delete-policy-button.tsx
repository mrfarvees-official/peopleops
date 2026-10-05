"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeletePolicyButton({
  id,
  name,
  redirectTo,
}: {
  id: string;
  name: string;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!confirm(`Delete the policy "${name}"? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/pbac/policies/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not delete");
      setBusy(false);
      return;
    }
    if (redirectTo) router.push(redirectTo);
    router.refresh();
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={remove}
        disabled={busy}
        className="rounded border px-3 py-1 text-sm text-danger hover:bg-surface-2 disabled:opacity-60"
      >
        {busy ? "Deleting…" : "Delete"}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}
