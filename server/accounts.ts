import "server-only";
import {
  createAccountService,
  type AccountService,
} from "../platform/application/accounts";
import {
  createSignupService,
  type SignupService,
} from "../platform/application/signup";
import {
  PrismaAccountRepository,
  PrismaSignupRepository,
} from "../platform/infrastructure/prisma-accounts-repository";
import { hashPassword, verifyPassword } from "../platform/infrastructure/scrypt-password-hasher";
import { PLATFORM_ROLES } from "../platform/domain/accounts";
import { createAuditWriter } from "./audit-writer";
import { container } from "./composition";
import { getDb } from "./db";
import { getPbac } from "./pbac";

const g = globalThis as unknown as {
  __accounts?: AccountService;
  __signup?: SignupService;
  __signupHits?: Map<string, number[]>;
};

const hasher = { hash: hashPassword, verify: verifyPassword };

export function getAccounts(): AccountService {
  return (g.__accounts ??= createAccountService({
    repo: new PrismaAccountRepository(getDb()),
    authz: getPbac(),
    audit: createAuditWriter(),
    hasher,
    log: container.logger,
  }));
}

const SIGNUPS_PER_HOUR = 5;

// Per-process throttle, enough to blunt scripted sign-ups from one address.
// Behind several instances, move this to the proxy or a shared store.
function allowSignup(key: string): boolean {
  const hits = (g.__signupHits ??= new Map());
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t: number) => now - t < 3_600_000);
  if (recent.length >= SIGNUPS_PER_HOUR) {
    hits.set(key, recent);
    return false;
  }
  hits.set(key, [...recent, now]);
  return true;
}

export function getSignup(): SignupService {
  return (g.__signup ??= createSignupService({
    repo: new PrismaSignupRepository(getDb()),
    hasher,
    audit: createAuditWriter(),
    log: container.logger,
    allow: allowSignup,
  }));
}

/** Roles a company admin may hand out, for the account form checkboxes. */
export async function getAssignableRoles() {
  const rows = await getDb().role.findMany({
    where: { code: { notIn: [...PLATFORM_ROLES] } },
    select: { code: true, name: true, description: true },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({
    code: r.code,
    name: r.name,
    description: r.description ?? undefined,
  }));
}
