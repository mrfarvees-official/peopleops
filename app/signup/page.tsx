import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignupForm } from "@/features/auth/signup-form";
import { PublicThemeCorner } from "@/features/theme/public-theme-corner";
import { getCurrentUser } from "@/server/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Create your company account · PeopleOps",
  description: "Start a PeopleOps workspace for your company.",
};

export default async function Page() {
  if (await getCurrentUser()) redirect("/dashboard");
  return (
    <>
      <SignupForm />
      <PublicThemeCorner />
    </>
  );
}
