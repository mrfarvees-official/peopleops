import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (await getCurrentUser()) redirect("/dashboard");
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-8 py-24">
      <h1 className="text-3xl font-semibold tracking-tight">PeopleOps</h1>
      <p className="max-w-md text-lg text-muted">
        HR and people operations platform.
      </p>
      <Link
        href="/login"
        className="w-fit rounded-full bg-accent px-5 py-3 font-medium text-accent-foreground"
      >
        Sign in
      </Link>
    </main>
  );
}
