import type { SessionUser } from "@/platform/domain/auth";
import { getBackups } from "@/server/data";
import { getDb } from "@/server/db";
import { getPbac } from "@/server/pbac";
import { BackupPanel, type BackupRights, type BackupRow } from "./backup-panel";

/** The Backup and restore section of Settings. Renders nothing for people who may not see backups. */
export async function BackupsSection({
  user,
  timezone,
  ctx,
}: {
  user: SessionUser;
  timezone: string;
  ctx?: { ip?: string };
}) {
  const res = { type: "backup", tenantId: user.tenantId };
  const tenants = await getDb().tenant.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  // One policy load for every button. A platform-wide backup needs the right in every company.
  const checks = [
    { action: "viewAny", resource: res },
    { action: "create", resource: res },
    { action: "restore", resource: res },
    { action: "delete", resource: res },
    { action: "export", resource: res },
    ...tenants.map((t) => ({
      action: "create",
      resource: { type: "backup", tenantId: t.id },
    })),
  ];
  const d = await getPbac().authorizeMany(user, checks, ctx);
  if (!d[0].allowed) return null;
  const rights: BackupRights = {
    create: d[1].allowed,
    restore: d[2].allowed,
    remove: d[3].allowed,
    download: d[4].allowed,
    platform: d[1].allowed && d.slice(5).every((x) => x.allowed),
  };

  const names = new Map(tenants.map((t) => [t.id, t.name]));
  const rows: BackupRow[] = (await getBackups().list(user, ctx)).map((b) => ({
    id: b.id,
    kind: b.kind,
    scope: b.scope,
    tenantName: b.tenantId ? (names.get(b.tenantId) ?? null) : null,
    createdAt: b.createdAt.toISOString(),
    sizeBytes: b.sizeBytes,
    rows: b.tables.reduce((n, t) => n + t.rows, 0),
    tables: b.tables.length,
    note: b.note,
  }));

  return <BackupPanel backups={rows} rights={rights} timezone={timezone} />;
}
