import { ModuleEditPage } from "@/features/hr/module-detail";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ module: string; id: string }>;
}) {
  const { module, id } = await params;
  return <ModuleEditPage moduleKey={module} id={id} />;
}
