import { AccessDenied } from "@/features/pbac/access-denied";
import { notFound } from "next/navigation";
import { draftFromPolicy } from "@/features/pbac/policy-draft";
import { getPolicyOr404, requirePolicyAccess } from "@/features/pbac/guard";
import { PolicyForm } from "@/features/pbac/policy-form";
import { getPbacAdmin } from "@/server/pbac";

export const dynamic = "force-dynamic";
export const metadata = { title: "Update policy" };

export default async function EditPolicyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePolicyAccess("update");
  if (!user) return <AccessDenied />;
  const { id } = await params;
  const admin = getPbacAdmin();
  const policy = await getPolicyOr404(user, id);
  if (policy.isSystem) notFound(); // seeded policies are managed by the seeder
  const catalogue = await admin.catalogue(user);
  return (
    <PolicyForm
      mode="edit"
      policyId={policy.id}
      initial={draftFromPolicy(policy)}
      catalogue={catalogue}
    />
  );
}
