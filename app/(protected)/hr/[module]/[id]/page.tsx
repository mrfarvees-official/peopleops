import { ModuleDetailPage } from "@/features/hr/module-detail";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ module: string; id: string }>;
}) {
  const { module, id } = await params;
  return <ModuleDetailPage moduleKey={module} id={id} />;
}
