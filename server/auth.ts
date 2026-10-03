import "server-only";
import {
  createAuthService,
  type AuthService,
} from "../platform/application/auth";
import { PrismaAuditWriter } from "../platform/infrastructure/prisma-audit-writer";
import { PrismaAuthRepository } from "../platform/infrastructure/prisma-auth-repository";
import {
  hashPassword,
  verifyPassword,
} from "../platform/infrastructure/scrypt-password-hasher";
import { container } from "./composition";
import { getDb } from "./db";

const g = globalThis as unknown as { __auth?: AuthService };

export function getAuth(): AuthService {
  return (g.__auth ??= createAuthService({
    repo: new PrismaAuthRepository(getDb()),
    hasher: { hash: hashPassword, verify: verifyPassword },
    audit: new PrismaAuditWriter(getDb()),
    ttlMs: container.config.SESSION_TTL_HOURS * 3_600_000,
  }));
}
