import { PublicThemeCorner } from "@/features/theme/public-theme-corner";
import { redirect } from "next/navigation";
import { DEMO_ACCOUNTS, demoPassword } from "@/features/landing/demo-accounts";
import { LoginForm } from "@/features/auth/login-form";
import { getCurrentUser } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  if (await getCurrentUser()) redirect("/dashboard");
  const { email } = await searchParams;
  const isDemo = DEMO_ACCOUNTS.some((a) => a.email === email);
  return (
    <>
      <LoginForm
        defaultEmail={email}
        defaultPassword={isDemo ? demoPassword() : undefined}
      />
      <PublicThemeCorner />
    </>
  );
}
