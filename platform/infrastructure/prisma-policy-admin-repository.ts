import type { PrismaClient } from "../../prisma/app/generated/prisma/client";
import {
  PolicyCodeTakenError,
  PolicyReferenceError,
  type PolicyAdminRepository,
  type PolicyInput,
  type PolicyView,
} from "../application/pbac-ports";

const include = {
  subjects: { include: { role: { select: { code: true } } } },
  targets: {
    include: {
      action: { select: { code: true } },
      resource: { select: { code: true } },
    },
  },
  conditions: { orderBy: { position: "asc" as const } },
};

type Refs = {
  role: Map<string, string>;
  action: Map<string, string>;
  resource: Map<string, string>;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
const toView = (p: any): PolicyView => ({
  id: p.id,
  code: p.code,
  tenantId: p.tenantId,
  name: p.name,
  description: p.description,
  effect: p.effect,
  isActive: p.isActive,
  isSystem: p.isSystem,
  version: p.version,
  subjects: p.subjects.map((s: any) => ({
    type: s.type,
    role: s.role?.code,
    userId: s.userId ?? undefined,
  })),
  targets: p.targets.map((t: any) => ({
    action: t.action?.code ?? null,
    resource: t.resource?.code ?? null,
  })),
  conditions: p.conditions.map((c: any) => ({
    attribute: c.attribute,
    operator: c.operator,
    value: c.value ?? undefined,
    ref: c.ref ?? undefined,
  })),
});

const uniq = (xs: (string | undefined | null)[]) => [
  ...new Set(xs.filter((x): x is string => !!x)),
];

export class PrismaPolicyAdminRepository implements PolicyAdminRepository {
  constructor(private readonly db: PrismaClient) {}

  async list(tenantIds: string[]) {
    const rows = await this.db.policy.findMany({
      where: { OR: [{ tenantId: null }, { tenantId: { in: tenantIds } }] },
      include,
      orderBy: [{ tenantId: "asc" }, { code: "asc" }],
    });
    return rows.map(toView);
  }

  async get(id: string) {
    const row = await this.db.policy.findUnique({ where: { id }, include });
    return row ? toView(row) : null;
  }

  async create(tenantId: string | null, input: PolicyInput) {
    try {
      return await this.db.$transaction(async (tx) => {
        await this.ensureCodeFree(tx as PrismaClient, tenantId, input.code);
        const refs = await this.resolve(tx as PrismaClient, tenantId, input);
        const row = await tx.policy.create({
          data: {
            tenantId,
            code: input.code,
            name: input.name,
            description: input.description,
            effect: input.effect,
            isActive: input.isActive,
            ...this.children(input, refs),
          },
          include,
        });
        return toView(row);
      });
    } catch (e) {
      throw this.translate(e);
    }
  }

  async update(id: string, tenantId: string | null, input: PolicyInput) {
    try {
      return await this.db.$transaction(async (tx) => {
        await this.ensureCodeFree(tx as PrismaClient, tenantId, input.code, id);
        const refs = await this.resolve(tx as PrismaClient, tenantId, input);
        await tx.policySubject.deleteMany({ where: { policyId: id } });
        await tx.policyTarget.deleteMany({ where: { policyId: id } });
        await tx.policyCondition.deleteMany({ where: { policyId: id } });
        const row = await tx.policy.update({
          where: { id },
          data: {
            code: input.code,
            name: input.name,
            description: input.description ?? null,
            effect: input.effect,
            isActive: input.isActive,
            version: { increment: 1 },
            ...this.children(input, refs),
          },
          include,
        });
        return toView(row);
      });
    } catch (e) {
      throw this.translate(e);
    }
  }

  async remove(id: string) {
    await this.db.policy.delete({ where: { id } }); // children cascade
  }

  async catalogue() {
    const [actions, resources, roles, tenants, users] = await Promise.all([
      this.db.action.findMany({ select: { code: true, description: true }, orderBy: { code: "asc" } }),
      this.db.resource.findMany({ select: { code: true, description: true }, orderBy: { code: "asc" } }),
      this.db.role.findMany({ select: { code: true, name: true, description: true }, orderBy: { name: "asc" } }),
      this.db.tenant.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      this.db.user.findMany({
        where: { deletedAt: null },
        select: { id: true, email: true, displayName: true, tenant: { select: { name: true } } },
        orderBy: { displayName: "asc" },
        take: 1000,
      }),
    ]);
    return {
      actions,
      resources,
      roles,
      tenants,
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        displayName: u.displayName,
        tenantName: u.tenant.name,
      })),
    };
  }

  // Maps codes to ids. User subjects must belong to the policy's tenant (any, if global).
  private async resolve(
    db: PrismaClient,
    tenantId: string | null,
    input: PolicyInput,
  ): Promise<Refs> {
    if (tenantId && !(await db.tenant.findUnique({ where: { id: tenantId } }))) {
      throw new PolicyReferenceError([`tenant:${tenantId}`]);
    }
    const roleCodes = uniq(input.subjects.map((s) => s.role));
    const userIds = uniq(input.subjects.map((s) => s.userId));
    const actionCodes = uniq(input.targets.map((t) => t.action));
    const resourceCodes = uniq(input.targets.map((t) => t.resource));

    const [roles, users, actions, resources] = await Promise.all([
      db.role.findMany({ where: { code: { in: roleCodes } }, select: { id: true, code: true } }),
      db.user.findMany({
        where: {
          id: { in: userIds },
          ...(tenantId ? { tenantId } : {}),
          deletedAt: null,
        },
        select: { id: true },
      }),
      db.action.findMany({ where: { code: { in: actionCodes } }, select: { id: true, code: true } }),
      db.resource.findMany({ where: { code: { in: resourceCodes } }, select: { id: true, code: true } }),
    ]);

    const missing = [
      ...roleCodes.filter((c) => !roles.some((r) => r.code === c)).map((c) => `role:${c}`),
      ...userIds.filter((i) => !users.some((u) => u.id === i)).map((i) => `user:${i}`),
      ...actionCodes.filter((c) => !actions.some((a) => a.code === c)).map((c) => `action:${c}`),
      ...resourceCodes.filter((c) => !resources.some((r) => r.code === c)).map((c) => `resource:${c}`),
    ];
    if (missing.length) throw new PolicyReferenceError(missing);

    return {
      role: new Map(roles.map((r) => [r.code, r.id])),
      action: new Map(actions.map((a) => [a.code, a.id])),
      resource: new Map(resources.map((r) => [r.code, r.id])),
    };
  }

  private children(input: PolicyInput, refs: Refs) {
    return {
      subjects: {
        create: input.subjects.map((s) => ({
          type: s.type,
          roleId: s.role ? refs.role.get(s.role) : undefined,
          userId: s.userId,
        })),
      },
      targets: {
        create: input.targets.map((t) => ({
          actionId: t.action ? refs.action.get(t.action) : undefined,
          resourceId: t.resource ? refs.resource.get(t.resource) : undefined,
        })),
      },
      conditions: {
        create: input.conditions.map((c, position) => ({
          attribute: c.attribute,
          operator: c.operator,
          value: c.value === undefined ? undefined : (c.value as never),
          ref: c.ref,
          position,
        })),
      },
    };
  }

  // MySQL treats NULLs as distinct in a unique index, so the (tenantId, code)
  // key does not stop two global policies sharing a code. Check it here.
  private async ensureCodeFree(
    db: PrismaClient,
    tenantId: string | null,
    code: string,
    exceptId?: string,
  ) {
    if (tenantId !== null) return; // the unique index covers tenant policies
    const clash = await db.policy.findFirst({
      where: { tenantId: null, code, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
    if (clash) throw new PolicyCodeTakenError();
  }

  private translate(e: unknown) {
    if ((e as { code?: string })?.code === "P2002") return new PolicyCodeTakenError();
    return e;
  }
}
