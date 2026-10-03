"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: f.get("email"),
        password: f.get("password"),
      }),
    });
    if (res.ok) {
      router.replace("/dashboard");
      router.refresh();
      return;
    }
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    setError(body?.error ?? "Sign-in failed");
    setBusy(false);
  }

  const input = "w-full rounded border bg-surface p-2";
  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto mt-24 w-full max-w-sm space-y-4 p-6"
    >
      <h1 className="text-2xl font-bold">Sign in</h1>
      <input
        name="email"
        type="email"
        required
        autoComplete="username"
        placeholder="Email"
        className={input}
      />
      <input
        name="password"
        type="password"
        required
        autoComplete="current-password"
        placeholder="Password"
        className={input}
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        disabled={busy}
        className="w-full rounded bg-accent p-2 text-accent-foreground disabled:opacity-50"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
