import { PublicThemeCorner } from "@/features/theme/public-theme-corner";
import { demoPassword } from "@/features/landing/demo-accounts";
import { LandingPage } from "@/features/landing/landing-page";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (await getCurrentUser()) redirect("/dashboard");
  return (
    <>
      <LandingPage password={demoPassword()} />
      <PublicThemeCorner />
    </>
  );
}
