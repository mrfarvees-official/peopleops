"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signupAction } from "./actions";

const input = "w-full rounded border bg-surface p-2";

function Field({
  name,
  label,
  error,
  ...rest
}: {
  name: string;
  label: string;
  error?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      <input
        name={name}
        required
        aria-invalid={error ? true : undefined}
        className={input}
        {...rest}
      />
      {error && <span className="block text-xs text-danger">{error}</span>}
    </label>
  );
}

export function SignupForm() {
  const [state, action, pending] = useActionState(signupAction, null);
  const e = state?.fieldErrors ?? {};

  return (
    <form action={action} className="mx-auto mt-16 w-full max-w-sm space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-bold">Create your company account</h1>
        <p className="text-sm text-muted">
          You become the HR admin and can add your team afterwards.
        </p>
      </div>

      <Field name="companyName" label="Company name" error={e.companyName} autoComplete="organization" />
      <Field name="displayName" label="Your name" error={e.displayName} autoComplete="name" />
      <Field name="email" type="email" label="Work email" error={e.email} autoComplete="username" />
      <Field
        name="password"
        type="password"
        label="Password"
        error={e.password}
        autoComplete="new-password"
        minLength={10}
      />
      <Field
        name="confirm"
        type="password"
        label="Confirm password"
        error={e.confirm}
        autoComplete="new-password"
      />
      <p className="text-xs text-muted">At least 10 characters, with letters and a number.</p>

      {state?.error && (
        <p role="alert" className="rounded border border-danger p-3 text-sm text-danger">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-accent p-2 text-accent-foreground disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create account"}
      </button>

      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
