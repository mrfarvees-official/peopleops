import { AccessDenied } from "@/features/pbac/access-denied";
import { requirePolicyAccess } from "@/features/pbac/guard";
import { PolicyForm } from "@/features/pbac/policy-form";
import { getPbacAdmin } from "@/server/pbac";

export const dynamic = "force-dynamic";
export const metadata = { title: "New policy" };

export default async function NewPolicyPage() {
  const user = await requirePolicyAccess("create");
  if (!user) return <AccessDenied />;
  const catalogue = await getPbacAdmin().catalogue(user);
  return <PolicyForm mode="create" catalogue={catalogue} />;
}
