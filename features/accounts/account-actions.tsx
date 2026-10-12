"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Remove or restore one account through the API; the server decides if it is allowed. */
export function AccountActionButton({
  id,
  name,
  kind,
}: {
  id: string;
  name: string;
  kind: "remove" | "restore";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    if (
      kind === "remove" &&
      !confirm(
        `Remove the account for ${name}? They will be signed out and can no longer sign in.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(
      kind === "remove" ? `/api/accounts/${id}` : `/api/accounts/${id}/restore`,
      { method: kind === "remove" ? "DELETE" : "POST" },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong");
      setBusy(false);
      return;
    }
    setBusy(false);
    router.refresh();
  }

  const text =
    kind === "remove"
      ? busy
        ? "Removing…"
        : "Remove"
      : busy
        ? "Restoring…"
        : "Restore";

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={go}
        disabled={busy}
        className={`rounded border px-3 py-1 text-sm hover:bg-surface-2 disabled:opacity-60 ${
          kind === "remove" ? "text-danger" : ""
        }`}
      >
        {text}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}
