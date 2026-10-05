import type { PrismaClient } from "../../prisma/app/generated/prisma/client";
import type { BackupRecord, BackupRepository } from "../application/data-ports";

type Row = {
  id: string;
  kind: string;
  scope: string;
  tenantId: string | null;
  status: string;
  storageKey: string;
  sizeBytes: number;
  checksum: string;
  tables: unknown;
  note: string | null;
  createdBy: string | null;
  createdAt: Date;
};

const toRecord = (r: Row): BackupRecord => ({
  ...r,
  kind: r.kind as BackupRecord["kind"],
  scope: r.scope as BackupRecord["scope"],
  status: "completed",
  tables: r.tables as BackupRecord["tables"],
});

export class PrismaBackupRepository implements BackupRepository {
  constructor(private readonly db: PrismaClient) {}

  async insert(r: Omit<BackupRecord, "createdAt">) {
    return toRecord(await this.db.backup.create({ data: { ...r, tables: r.tables } }));
  }

  async get(id: string) {
    const r = await this.db.backup.findUnique({ where: { id } });
    return r ? toRecord(r) : null;
  }

  async list(q: { tenantIds: string[]; includePlatform: boolean }) {
    const rows = await this.db.backup.findMany({
      where: {
        OR: [
          { scope: "tenant", tenantId: { in: q.tenantIds } },
          ...(q.includePlatform ? [{ scope: "platform" }] : []),
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return rows.map(toRecord);
  }

  async remove(id: string) {
    await this.db.backup.delete({ where: { id } });
  }
}
