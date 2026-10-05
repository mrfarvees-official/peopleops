import { BackupsSection } from "@/features/backups/backups-section";
import { SettingField } from "@/features/settings/setting-field";
import { getCurrentTheme } from "@/features/theme/current-theme";
import { ThemeSwitcher } from "@/features/theme/theme-switcher";
import { can } from "@/server/authorization";
import { requestInfo, requireUser } from "@/server/session";
import { getSettingsAdmin } from "@/server/settings";
import { getTenantInfo } from "@/server/tenant";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const resource = { type: "setting", tenantId: user.tenantId };

  // Platform settings are shown only to people PBAC lets see them
  // (super_admin by policy, system_developer by bypass).
  const [mayView, mayEdit] = await Promise.all([
    can("viewAny", resource),
    can("update", resource),
  ]);
  const settings = mayView
    ? await getSettingsAdmin().list(user, await requestInfo())
    : [];
  const groups = [...new Set(settings.map((s) => s.group))];
  const tenant = await getTenantInfo(user.tenantId);

  return (
    <main className="mx-auto w-full max-w-4xl space-y-4 p-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <section className="space-y-3 rounded border bg-surface p-4">
        <div>
          <h2 className="font-semibold">Appearance</h2>
          <p className="text-sm text-muted">
            Choose how the app looks on this device.
          </p>
        </div>
        <ThemeSwitcher initial={await getCurrentTheme()} />
      </section>

      {groups.map((group) => (
        <section
          key={group}
          className="space-y-3 rounded border bg-surface p-4"
        >
          <div>
            <h2 className="font-semibold">{group}</h2>
            <p className="text-sm text-muted">
              Platform-wide settings. Changes apply to every company.
            </p>
          </div>
          {settings
            .filter((s) => s.group === group)
            .map((s) => (
              <SettingField
                key={s.key}
                settingKey={s.key}
                label={s.label}
                description={s.description}
                type={s.type}
                value={s.value}
                isDefault={s.isDefault}
                canEdit={mayEdit}
              />
            ))}
        </section>
      ))}

      <BackupsSection
        user={user}
        timezone={tenant.timezone}
        ctx={await requestInfo()}
      />
    </main>
  );
}
