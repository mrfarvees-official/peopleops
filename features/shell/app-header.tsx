import type { SessionUser } from "@/platform/domain/auth";
import type { TenantInfo } from "@/server/tenant";
import { ProfileMenu } from "./profile-menu";
import { toProfileMenuUser } from "./profile-user";

export function AppHeader({
  tenant,
  user,
}: {
  tenant: TenantInfo;
  user: SessionUser;
}) {
  return (
    <header className="flex items-center justify-between border-b px-6 py-3">
      <div className="flex items-center gap-3">
        {tenant.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={tenant.logoUrl}
            alt={`${tenant.name} logo, powered by PeopleOps`}
            className="h-8 w-8 rounded object-contain"
          />
        ) : (
          <span
            role="img"
            aria-label={`${tenant.name}, powered by PeopleOps`}
            className="flex h-8 w-8 items-center justify-center rounded bg-accent text-sm font-semibold text-accent-foreground"
          >
            {tenant.name.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="font-semibold">{tenant.name}</span>
      </div>
    </header>
  );
}
