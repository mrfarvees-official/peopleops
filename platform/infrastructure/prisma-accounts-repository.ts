import type { PrismaClient } from "../../prisma/app/generated/prisma/client";
import type {
  AccountPatch,
  AccountRepository,
  NewAccount,
  NewTenant,
  SignupRepository,
} from "../application/accounts-ports";
import {
  AccountNotFoundError,
  type AccountView,
} from "../domain/accounts";

const include = { roles: { include: { role: { select: { code: true } } } } } as const;

type Row = NonNullable<
  Awaited<ReturnType<PrismaClient["user"]["findFirst"]>>
> & { roles: { role: { code: string } }[] };

const toView = (u: Row): AccountView => ({
  id: u.id,
  tenantId: u.tenantId,
  email: u.email,
  displayName: u.displayName,
  status: u.status,
  roles: u.roles.map((r) => r.role.code).sort(),
  version: u.version,
  createdAt: u.createdAt,
  updatedAt: u.updatedAt,
  deletedAt: u.deletedAt,
});

export class PrismaAccountRepository implements AccountRepository {
  constructor(private readonly db: PrismaClient) {}

  async list(tenantId: string, opts: { includeRemoved: boolean }) {
    const rows = await this.db.user.findMany({
      where: { tenantId, ...(opts.includeRemoved ? {} : { deletedAt: null }) },
      include,
      orderBy: [{ displayName: "asc" }, { email: "asc" }],
    });
    return rows.map((r) => toView(r as Row));
  }

  async get(tenantId: string, id: string) {
    const row = await this.db.user.findFirst({ where: { id, tenantId }, include });
    return row ? toView(row as Row) : null;
  }

  async findByEmail(tenantId: string, email: string) {
    const row = await this.db.user.findUnique({
      where: { tenantId_email: { tenantId, email } },
      select: { id: true, deletedAt: true },
    });
    return row ? { id: row.id, removed: row.deletedAt !== null } : null;
  }

  async knownRoles(codes: string[]) {
    if (codes.length === 0) return [];
    const rows = await this.db.role.findMany({
      where: { code: { in: codes } },
      select: { code: true },
    });
    return rows.map((r) => r.code);
  }

  async create(tenantId: string, a: NewAccount) {
    const roles = await this.db.role.findMany({
      where: { code: { in: a.roles } },
      select: { id: true },
    });
    const row = await this.db.user.create({
      data: {
        tenantId,
        email: a.email,
        displayName: a.displayName,
        passwordHash: a.passwordHash,
        status: a.status,
        roles: { create: roles.map((r) => ({ roleId: r.id })) },
      },
      include,
    });
    return toView(row as Row);
  }

  async update(
    tenantId: string,
    id: string,
    patch: AccountPatch,
    expectedVersion?: number,
  ) {
    return this.db.$transaction(async (tx) => {
      const { count } = await tx.user.updateMany({
        where: {
          id,
          tenantId,
          deletedAt: null,
          ...(expectedVersion ? { version: expectedVersion } : {}),
        },
        data: {
          ...(patch.displayName !== undefined && { displayName: patch.displayName }),
          ...(patch.status !== undefined && { status: patch.status }),
          ...(patch.passwordHash !== undefined && { passwordHash: patch.passwordHash }),
          version: { increment: 1 },
        },
      });
      if (count === 0) return null;

      if (patch.roles) {
        const roles = await tx.role.findMany({
          where: { code: { in: patch.roles } },
          select: { id: true },
        });
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({
          data: roles.map((r) => ({ userId: id, roleId: r.id })),
        });
      }
      const row = await tx.user.findFirstOrThrow({ where: { id, tenantId }, include });
      return toView(row as Row);
    });
  }

  async remove(tenantId: string, id: string) {
    const { count } = await this.db.user.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    if (count === 0) throw new AccountNotFoundError();
  }

  async restore(tenantId: string, id: string) {
    const { count } = await this.db.user.updateMany({
      where: { id, tenantId },
      data: { deletedAt: null, version: { increment: 1 } },
    });
    if (count === 0) throw new AccountNotFoundError();
    const row = await this.db.user.findFirstOrThrow({ where: { id, tenantId }, include });
    return toView(row as Row);
  }

  async revokeSessions(userId: string) {
    await this.db.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  countActiveWithRole(tenantId: string, role: string, exceptUserId: string) {
    return this.db.user.count({
      where: {
        tenantId,
        status: "active",
        deletedAt: null,
        id: { not: exceptUserId },
        roles: { some: { role: { code: role } } },
      },
    });
  }
}

export class PrismaSignupRepository implements SignupRepository {
  constructor(private readonly db: PrismaClient) {}

  async codeExists(code: string) {
    return (await this.db.tenant.count({ where: { code } })) > 0;
  }

  async roleExists(code: string) {
    return (await this.db.role.count({ where: { code } })) > 0;
  }

  async createTenant(t: NewTenant) {
    return this.db.$transaction(async (tx) => {
      const role = await tx.role.findUniqueOrThrow({
        where: { code: t.admin.role },
        select: { id: true },
      });
      const tenant = await tx.tenant.create({
        data: {
          code: t.code,
          name: t.name,
          isActive: true,
          profile: { create: { country: t.country, contactEmail: t.admin.email } },
        },
        select: { id: true },
      });
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: t.admin.email,
          displayName: t.admin.displayName,
          passwordHash: t.admin.passwordHash,
          status: "active",
          roles: { create: [{ roleId: role.id }] },
        },
        select: { id: true },
      });
      return { tenantId: tenant.id, userId: user.id };
    });
  }
}
