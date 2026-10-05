import { ModuleListPage } from "@/features/hr/module-list";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ module: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { module } = await params;
  return <ModuleListPage moduleKey={module} searchParams={searchParams} />;
}
