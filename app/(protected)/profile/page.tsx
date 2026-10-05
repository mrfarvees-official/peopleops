import { toProfileMenuUser } from "@/features/shell/profile-user";
import { getUserProfile } from "@/server/profile";
import { requireUser } from "@/server/session";
import { getTenantInfo } from "@/server/tenant";

export const dynamic = "force-dynamic";
export const metadata = { title: "My profile" };

export default async function ProfilePage() {
  const user = await requireUser();
  const [profile, tenant] = await Promise.all([
    getUserProfile(user.id),
    getTenantInfo(user.tenantId),
  ]);
  const { roles } = toProfileMenuUser(user);

  const rows: [string, string | null | undefined][] = [
    ["Name", user.displayName],
    ["Preferred name", profile?.preferredName],
    ["Email", user.email],
    ["Job title", profile?.jobTitle],
    ["Phone", profile?.phone],
    ["Roles", roles],
    ["Company", tenant.name],
    ["Language", profile?.locale],
    ["Time zone", profile?.timezone],
  ];

  return (
    <main className="mx-auto w-full max-w-2xl space-y-4 p-6">
      <h1 className="text-2xl font-bold">My profile</h1>
      <dl className="divide-y rounded border bg-surface text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-3 gap-3 p-3">
            <dt className="text-muted">{label}</dt>
            <dd className="col-span-2">{value || "—"}</dd>
          </div>
        ))}
      </dl>
    </main>
  );
}
