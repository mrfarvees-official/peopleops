import type { PrismaClient } from "../../prisma/app/generated/prisma/client";
import type { AuthRepository, AuthUserRecord } from "../application/auth-ports";

const userInclude = {
  tenant: { select: { isActive: true } },
  roles: { include: { role: { select: { code: true } } } },
} as const;

type UserRow = Awaited<ReturnType<PrismaClient["user"]["findFirstOrThrow"]>> & {
  tenant: { isActive: boolean };
  roles: { role: { code: string } }[];
};

function toRecord(u: UserRow): AuthUserRecord {
  return {
    id: u.id,
    tenantId: u.tenantId,
    email: u.email,
    displayName: u.displayName,
    passwordHash: u.passwordHash,
    status: u.status,
    tenantActive: u.tenant.isActive,
    roles: u.roles.map((r: { role: { code: string } }) => r.role.code),
  };
}

export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly db: PrismaClient) {}

  async findUsersByEmail(email: string) {
    const rows = await this.db.user.findMany({
      where: { email, deletedAt: null },
      include: userInclude,
    });
    return rows.map(toRecord);
  }

  async createSession(s: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    ip?: string;
    userAgent?: string;
  }) {
    const row = await this.db.session.create({ data: s, select: { id: true } });
    return { id: row.id };
  }

  async findSession(tokenHash: string) {
    const s = await this.db.session.findUnique({
      where: { tokenHash },
      include: { user: { include: userInclude } },
    });
    if (!s || s.user.deletedAt) return null;
    const rec = toRecord(s.user);
    return {
      id: s.id,
      expiresAt: s.expiresAt,
      revokedAt: s.revokedAt,
      lastSeenAt: s.lastSeenAt,
      user: {
        id: rec.id,
        tenantId: rec.tenantId,
        email: rec.email,
        displayName: rec.displayName,
        roles: rec.roles,
        status: rec.status,
        tenantActive: rec.tenantActive,
      },
    };
  }

  async touchSession(id: string, at: Date) {
    await this.db.session.update({ where: { id }, data: { lastSeenAt: at } });
  }

  async revokeSession(id: string) {
    await this.db.session.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }
}
