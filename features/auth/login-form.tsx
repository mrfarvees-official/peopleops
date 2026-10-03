import { loginAction } from "./actions";

export function LoginForm() {
  async function handleLogin(formData: FormData): Promise<void> {
    "use server";
    await loginAction(formData);
  }

  return (
    <form
      action={handleLogin}
      className="mx-auto mt-24 w-full max-w-sm space-y-4 p-6"
    >
      <h1 className="text-2xl font-bold">Sign in</h1>

      <input
        name="email"
        type="email"
        required
        autoComplete="username"
        placeholder="Email"
        className="w-full rounded border bg-surface p-2"
      />

      <input
        name="password"
        type="password"
        required
        autoComplete="current-password"
        placeholder="Password"
        className="w-full rounded border bg-surface p-2"
      />

      <button
        type="submit"
        className="w-full rounded bg-accent p-2 text-accent-foreground"
      >
        Sign in
      </button>
    </form>
  );
}
