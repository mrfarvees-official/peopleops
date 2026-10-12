import { randomBytes } from "node:crypto";
import { z } from "zod";
import { OWNER_ROLE, slugify } from "../domain/accounts";
import { normalizeEmail } from "../domain/auth";
import { createAudit } from "./audit-api";
import type { AuditWriter } from "./audit-writer";
import { passwordRule } from "./accounts";
import type { PasswordHasher } from "./auth-ports";
import type { SignupRepository } from "./accounts-ports";
import type { HrLogger } from "./hr-module";

export const signupInput = z.object({
  companyName: z.string().trim().min(2, "Enter your company name").max(255),
  displayName: z.string().trim().min(1, "Enter your name").max(255),
  email: z.string().trim().email().max(255).transform(normalizeEmail),
  password: passwordRule,
  country: z
    .string()
    .trim()
    .length(2)
    .transform((c) => c.toUpperCase())
    .default("LK"),
});

export class SignupRateLimitError extends Error {
  constructor() {
    super("Too many sign-ups from this address. Try again later.");
    this.name = "SignupRateLimitError";
  }
}

export interface SignupDeps {
  repo: SignupRepository;
  hasher: PasswordHasher;
  audit: AuditWriter;
  log: HrLogger;
  /** Returns false when the caller has signed up too often. */
  allow?: (key: string) => boolean;
}

/**
 * Public company sign-up. There is no signed-in person yet, so there is no PBAC
 * check: the new tenant is created empty and its first user becomes its HR admin,
 * which is the only thing this flow can grant. The outcome is still logged and
 * audited, against the new tenant.
 */
export function createSignupService({ repo, hasher, audit: writer, log, allow }: SignupDeps) {
  async function uniqueCode(name: string) {
    const base = slugify(name);
    if (!(await repo.codeExists(base))) return base;
    for (let i = 0; i < 5; i++) {
      const code = `${base.slice(0, 24)}-${randomBytes(2).toString("hex")}`;
      if (!(await repo.codeExists(code))) return code;
    }
    throw new Error("Could not allocate a company code");
  }

  return {
    async signUp(raw: unknown, req: { ip?: string; requestId?: string } = {}) {
      const fields = {
        feature: "signup",
        action: "create",
        resourceType: "tenant",
        requestId: req.requestId,
      };
      try {
        if (allow && !allow(req.ip ?? "unknown")) throw new SignupRateLimitError();
        const input = signupInput.parse(raw);
        if (!(await repo.roleExists(OWNER_ROLE))) {
          throw new Error(`Role ${OWNER_ROLE} is missing; run the seed`);
        }
        const created = await repo.createTenant({
          code: await uniqueCode(input.companyName),
          name: input.companyName,
          country: input.country,
          admin: {
            email: input.email,
            displayName: input.displayName,
            passwordHash: await hasher.hash(input.password),
            role: OWNER_ROLE,
          },
        });
        const audit = createAudit(writer, {
          tenantId: created.tenantId,
          actorId: created.userId,
          requestId: req.requestId,
          ip: req.ip,
        });
        await audit.created(
          { type: "tenant", id: created.tenantId },
          { name: input.companyName, country: input.country },
        );
        await audit.created(
          { type: "user", id: created.userId },
          { email: input.email, displayName: input.displayName, roles: [OWNER_ROLE] },
        );
        log.info(
          {
            ...fields,
            resourceId: created.tenantId,
            actorId: created.userId,
            tenantId: created.tenantId,
            outcome: "success",
          },
          "company signed up",
        );
        return { ...created, email: input.email };
      } catch (e) {
        const name = (e as Error)?.name;
        const rejected = name === "ZodError" || name === "SignupRateLimitError";
        (rejected ? log.warn : log.error).call(
          log,
          { ...fields, outcome: rejected ? "denied" : "failed", ...(rejected ? {} : { err: e }) },
          rejected ? "company signup rejected" : "company signup failed",
        );
        throw e;
      }
    }
  };
}

export type SignupService = ReturnType<typeof createSignupService>;
