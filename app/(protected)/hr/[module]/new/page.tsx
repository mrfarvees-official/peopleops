import { ModuleNewPage } from "@/features/hr/module-detail";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ module: string }>;
}) {
  const { module } = await params;
  return <ModuleNewPage moduleKey={module} />;
}
