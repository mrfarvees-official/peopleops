import type { Metadata } from "next";
import { AppFooter } from "@/features/shell/app-footer";
import { AppHeader } from "@/features/shell/app-header";
import { Sidebar } from "@/features/shell/sidebar";
import { getCurrentUser, requireUser } from "@/server/session";
import { getTenantInfo } from "@/server/tenant";

// Signed-in pages are branded with the tenant. PeopleOps stays in the
// metadata (application name, generator, description) for SEO.
export async function generateMetadata(): Promise<Metadata> {
  const user = await getCurrentUser();
  if (!user) return {};
  const tenant = await getTenantInfo(user.tenantId);
  return {
    title: { default: tenant.name, template: `%s · ${tenant.name}` },
    description: `${tenant.name} workspace, powered by PeopleOps`,
    applicationName: "PeopleOps",
    generator: "PeopleOps",
    robots: { index: false, follow: false },
  };
}

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const tenant = await getTenantInfo(user.tenantId);
  return (
    <div className="flex h-dvh flex-col">
      <AppHeader tenant={tenant} user={user} />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <Sidebar user={user} />
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</div>
      </div>
      <AppFooter tenant={tenant} />
    </div>
  );
}
