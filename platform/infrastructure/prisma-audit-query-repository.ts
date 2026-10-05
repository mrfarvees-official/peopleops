import type { PrismaClient } from "../../prisma/app/generated/prisma/client";
import type {
  AuditCatalogueRaw,
  AuditQueryRepository,
  AuditRow,
  AuditSearch,
} from "../application/audit-query";

const select = {
  id: true,
  occurredAt: true,
  tenantId: true,
  actorId: true,
  action: true,
  resourceType: true,
  resourceId: true,
  outcome: true,
  reason: true,
  requestId: true,
  ip: true,
  before: true,
  after: true,
} as const;

type Row = {
  id: bigint;
  occurredAt: Date;
  tenantId: string | null;
  actorId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  outcome: "success" | "denied" | "failed";
  reason: string | null;
  requestId: string | null;
  ip: string | null;
  before: unknown;
  after: unknown;
};

const toRow = (r: Row): AuditRow => ({ ...r, id: r.id.toString() });

export class PrismaAuditQueryRepository implements AuditQueryRepository {
  constructor(private readonly db: PrismaClient) {}

  async search(q: AuditSearch) {
    const { filters: f } = q;
    const visible = [
      { tenantId: { in: q.tenantIds } },
      ...(q.includeSystem ? [{ tenantId: null }] : []),
    ];
    const where = {
      AND: [
        { OR: visible },
        ...(f.tenantId ? [{ tenantId: f.tenantId }] : []),
        ...(f.actorId ? [{ actorId: f.actorId }] : []),
        ...(f.action ? [{ action: f.action }] : []),
        ...(f.resourceType ? [{ resourceType: f.resourceType }] : []),
        ...(f.outcome ? [{ outcome: f.outcome }] : []),
        ...(f.from || f.to
          ? [
              {
                occurredAt: {
                  ...(f.from ? { gte: f.from } : {}),
                  ...(f.to
                    ? { lt: new Date(f.to.getTime() + 86_400_000) }
                    : {}),
                },
              },
            ]
          : []),
      ],
    };

    const [rows, total] = await Promise.all([
      this.db.auditLog.findMany({
        where,
        select,
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        skip: q.skip,
        take: q.take,
      }),
      this.db.auditLog.count({ where }),
    ]);
    return { rows: rows.map((r) => toRow(r as Row)), total };
  }

  async get(id: string) {
    if (!/^\d{1,19}$/.test(id)) return null;
    const row = await this.db.auditLog.findUnique({
      where: { id: BigInt(id) },
      select,
    });
    return row ? toRow(row as Row) : null;
  }

  async catalogue(): Promise<AuditCatalogueRaw> {
    const [tenants, actors, actions, resources] = await Promise.all([
      this.db.tenant.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      this.db.user.findMany({
        select: { id: true, displayName: true, email: true },
        orderBy: { displayName: "asc" },
        take: 1000,
      }),
      this.db.auditLog.findMany({
        distinct: ["action"],
        select: { action: true },
        orderBy: { action: "asc" },
      }),
      this.db.auditLog.findMany({
        distinct: ["resourceType"],
        select: { resourceType: true },
        orderBy: { resourceType: "asc" },
      }),
    ]);
    return {
      tenants,
      actors,
      actions: actions.map((a) => a.action),
      resourceTypes: resources.map((r) => r.resourceType),
    };
  }
}
