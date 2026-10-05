"use client";

import { useActionState } from "react";
import { loginAction } from "./actions";

export function LoginForm({
  defaultEmail,
  defaultPassword,
}: {
  defaultEmail?: string;
  defaultPassword?: string;
}) {
  const [state, action, pending] = useActionState(loginAction, null);

  return (
    <form
      action={action}
      className="mx-auto mt-24 w-full max-w-sm space-y-4 p-6"
    >
      <h1 className="text-2xl font-bold">Sign in</h1>

      <input
        name="email"
        type="email"
        defaultValue={defaultEmail}
        required
        autoComplete="username"
        placeholder="Email"
        aria-invalid={state?.error ? true : undefined}
        className="w-full rounded border bg-surface p-2"
      />

      <input
        name="password"
        type="password"
        defaultValue={defaultPassword}
        required
        autoComplete="current-password"
        placeholder="Password"
        aria-invalid={state?.error ? true : undefined}
        className="w-full rounded border bg-surface p-2"
      />

      {state?.error && (
        <p
          role="alert"
          className="rounded border border-danger p-3 text-sm text-danger"
        >
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-accent p-2 text-accent-foreground disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
