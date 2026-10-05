import Link from "next/link";

export function AccessDenied({
  what = "manage policies",
}: {
  what?: string;
}) {
  return (
    <main className="mx-auto mt-24 w-full max-w-md space-y-3 p-6 text-center">
      <h1 className="text-2xl font-bold">Access denied</h1>
      <p className="text-sm text-muted">
        You don&apos;t have permission to {what}. If you think this is a
        mistake, ask a super admin.
      </p>
      <Link
        href="/dashboard"
        className="inline-block rounded border px-3 py-2 text-sm hover:bg-surface-2"
      >
        Back to dashboard
      </Link>
    </main>
  );
}
