import type { PrismaClient } from "../../prisma/app/generated/prisma/client";
import type { PolicyRepository } from "../application/pbac-ports";
import type { Policy } from "../domain/pbac";

export class PrismaPolicyRepository implements PolicyRepository {
  constructor(private readonly db: PrismaClient) {}

  async findApplicable(q: {
    tenantId: string;
    userId: string;
    roles: string[];
  }): Promise<Policy[]> {
    const rows = await this.db.policy.findMany({
      where: {
        isActive: true,
        OR: [{ tenantId: null }, { tenantId: q.tenantId }],
        subjects: {
          some: {
            OR: [
              { type: "any" },
              { type: "user", userId: q.userId },
              { type: "role", role: { code: { in: q.roles } } },
            ],
          },
        },
      },
      include: {
        subjects: { include: { role: { select: { code: true } } } },
        targets: {
          include: {
            action: { select: { code: true } },
            resource: { select: { code: true } },
          },
        },
        conditions: { orderBy: { position: "asc" } },
      },
    });

    return rows.map(
      (p: {
        id: any;
        code: any;
        effect: any;
        subjects: any[];
        targets: any[];
        conditions: any[];
      }) => ({
        id: p.id,
        code: p.code,
        effect: p.effect,
        subjects: p.subjects.map(
          (s: { type: any; role: { code: any }; userId: any }) => ({
            type: s.type,
            role: s.role?.code,
            userId: s.userId ?? undefined,
          }),
        ),
        targets: p.targets.map(
          (t: { action: { code: any }; resource: { code: any } }) => ({
            action: t.action?.code ?? null,
            resource: t.resource?.code ?? null,
          }),
        ),
        conditions: p.conditions.map(
          (c: { attribute: any; operator: any; value: any; ref: any }) => ({
            attribute: c.attribute,
            operator: c.operator,
            value: c.value ?? undefined,
            ref: c.ref ?? undefined,
          }),
        ),
      }),
    );
  }
}
