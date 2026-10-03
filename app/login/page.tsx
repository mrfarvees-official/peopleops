import { redirect } from "next/navigation";
import { LoginForm } from "@/features/auth/login-form";
import { getCurrentUser } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (await getCurrentUser()) redirect("/dashboard");
  return <LoginForm />;
}
