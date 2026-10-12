import { z } from "zod";
import {
  AccountConflictError,
  AccountNotFoundError,
  AccountRuleError,
  EmailTakenError,
  OWNER_ROLE,
  isAssignableRole,
  type AccountView,
} from "../domain/accounts";
import { normalizeEmail, type SessionUser } from "../domain/auth";
import { createAudit } from "./audit-api";
import type { AuditWriter } from "./audit-writer";
import type { AccountRepository } from "./accounts-ports";
import type { PasswordHasher } from "./auth-ports";
import type { HrLogger } from "./hr-module";
import type { Authorizer } from "./pbac";

export interface AccountCtx {
  requestId?: string;
  ip?: string;
}

export const passwordRule = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(200)
  .refine((p) => /[a-zA-Z]/.test(p) && /[0-9]/.test(p), {
    message: "Use letters and at least one number",
  });

const email = z
  .string()
  .trim()
  .email()
  .max(255)
  .transform(normalizeEmail);
const displayName = z.string().trim().min(1).max(255);
const roles = z
  .array(z.string().min(1).max(64))
  .min(1, "Choose at least one role")
  .max(20)
  .transform((r) => [...new Set(r)]);

export const createAccountInput = z.object({
  email,
  displayName,
  password: passwordRule,
  roles,
  status: z.enum(["active", "suspended"]).default("active"),
});

export const updateAccountInput = z.object({
  displayName: displayName.optional(),
  roles: roles.optional(),
  status: z.enum(["active", "suspended"]).optional(),
  // Leave empty to keep the current password.
  password: z
    .union([z.literal(""), passwordRule])
    .optional()
    .transform((p) => p || undefined),
  version: z.number().int().positive().optional(),
});

export interface AccountsDeps {
  repo: AccountRepository;
  authz: Authorizer;
  audit: AuditWriter;
  hasher: PasswordHasher;
  log: HrLogger;
}

// Passwords never reach the audit log; only the fact that one was set.
const snapshot = (a: AccountView) => ({
  email: a.email,
  displayName: a.displayName,
  status: a.status,
  roles: [...a.roles].sort(),
});

export function createAccountService({
  repo,
  authz,
  audit: writer,
  hasher,
  log,
}: AccountsDeps) {
  const resource = (user: SessionUser, id?: string, extra: object = {}) => ({
    type: "user",
    id,
    tenantId: user.tenantId,
    ...extra,
  });
  const attrs = (a: AccountView) => ({
    ownerId: a.id,
    status: a.status,
  });
  const auditFor = (user: SessionUser, ctx: AccountCtx) =>
    createAudit(writer, { tenantId: user.tenantId, actorId: user.id, ...ctx });

  /** Runs one action and logs its outcome: info on success, warn on denial, error on failure. */
  async function run<T>(
    action: string,
    user: SessionUser,
    ctx: AccountCtx,
    resourceId: string | undefined,
    fn: () => Promise<T>,
  ): Promise<T> {
    const fields = {
      feature: "accounts",
      action,
      resourceType: "user",
      resourceId,
      actorId: user.id,
      tenantId: user.tenantId,
      requestId: ctx.requestId,
    };
    try {
      const out = await fn();
      log.info({ ...fields, outcome: "success" }, `accounts ${action}`);
      return out;
    } catch (e) {
      const name = (e as Error)?.name;
      if (name === "ForbiddenError") {
        log.warn({ ...fields, outcome: "denied" }, `accounts ${action} denied`);
      } else if (
        name === "AccountNotFoundError" ||
        name === "EmailTakenError" ||
        name === "AccountRuleError" ||
        name === "ConflictError" ||
        name === "ZodError"
      ) {
        // The caller did something wrong; that is not a server fault.
        log.warn(
          { ...fields, outcome: "failed", reason: (e as Error).message.slice(0, 200) },
          `accounts ${action} rejected`,
        );
      } else {
        log.error(
          { ...fields, outcome: "failed", err: e },
          `accounts ${action} failed`,
        );
      }
      throw e;
    }
  }

  async function load(user: SessionUser, id: string) {
    const a = await repo.get(user.tenantId, id);
    if (!a) throw new AccountNotFoundError();
    return a;
  }

  async function checkRoles(codes: string[]) {
    const bad = codes.filter((c) => !isAssignableRole(c));
    const known = await repo.knownRoles(codes.filter(isAssignableRole));
    const unknown = codes.filter((c) => isAssignableRole(c) && !known.includes(c));
    if (bad.length || unknown.length) {
      throw new AccountRuleError(
        `These roles cannot be assigned: ${[...bad, ...unknown].join(", ")}`,
      );
    }
  }

  /** A company must always keep someone who can manage accounts. */
  async function keepAnAdmin(
    user: SessionUser,
    target: AccountView,
    willBeAdmin: boolean,
  ) {
    const isAdminNow = target.status === "active" && target.roles.includes(OWNER_ROLE);
    if (!isAdminNow || willBeAdmin) return;
    const others = await repo.countActiveWithRole(
      user.tenantId,
      OWNER_ROLE,
      target.id,
    );
    if (others === 0) {
      throw new AccountRuleError(
        "The company needs at least one active HR admin. Make someone else an HR admin first.",
      );
    }
  }

  return {
    async list(
      user: SessionUser,
      opts: { includeRemoved?: boolean } = {},
      ctx: AccountCtx = {},
    ) {
      return run("viewAny", user, ctx, undefined, async () => {
        await authz.assert(user, "viewAny", resource(user), ctx);
        return repo.list(user.tenantId, { includeRemoved: !!opts.includeRemoved });
      });
    },

    async get(user: SessionUser, id: string, ctx: AccountCtx = {}) {
      return run("view", user, ctx, id, async () => {
        const a = await load(user, id);
        await authz.assert(user, "view", resource(user, id, attrs(a)), ctx);
        return a;
      });
    },

    async create(user: SessionUser, raw: unknown, ctx: AccountCtx = {}) {
      return run("create", user, ctx, undefined, async () => {
        // Authorize before the input is read: someone who could never create
        // an account learns nothing about what was valid.
        await authz.assert(user, "create", resource(user), ctx);
        const input = createAccountInput.parse(raw);
        await checkRoles(input.roles);
        const taken = await repo.findByEmail(user.tenantId, input.email);
        if (taken) throw new EmailTakenError(taken.removed);

        const created = await repo.create(user.tenantId, {
          email: input.email,
          displayName: input.displayName,
          passwordHash: await hasher.hash(input.password),
          status: input.status,
          roles: input.roles,
        });
        await auditFor(user, ctx).created(
          { type: "user", id: created.id },
          snapshot(created),
        );
        return created;
      });
    },

    async update(user: SessionUser, id: string, raw: unknown, ctx: AccountCtx = {}) {
      return run("update", user, ctx, id, async () => {
        const before = await load(user, id);
        await authz.assert(user, "update", resource(user, id, attrs(before)), ctx);
        if (before.deletedAt) {
          throw new AccountRuleError("Restore this account before changing it");
        }
        const input = updateAccountInput.parse(raw);

        const nextRoles = input.roles ?? before.roles;
        const nextStatus = input.status ?? before.status;
        if (input.roles) await checkRoles(input.roles);
        if (id === user.id && nextStatus !== "active") {
          throw new AccountRuleError("You cannot suspend your own account");
        }
        await keepAnAdmin(
          user,
          before,
          nextStatus === "active" && nextRoles.includes(OWNER_ROLE),
        );

        const after = await repo.update(
          user.tenantId,
          id,
          {
            displayName: input.displayName,
            status: input.status,
            roles: input.roles,
            passwordHash: input.password ? await hasher.hash(input.password) : undefined,
          },
          input.version,
        );
        if (!after) throw new AccountConflictError();

        // A new password, a suspension or a role change should take effect now,
        // not when the person's current session happens to expire.
        if (input.password || nextStatus !== "active") await repo.revokeSessions(id);

        await auditFor(user, ctx).updated(
          { type: "user", id },
          snapshot(before),
          { ...snapshot(after), ...(input.password ? { passwordChanged: true } : {}) },
        );
        return after;
      });
    },

    async remove(user: SessionUser, id: string, ctx: AccountCtx = {}) {
      return run("delete", user, ctx, id, async () => {
        const before = await load(user, id);
        await authz.assert(user, "delete", resource(user, id, attrs(before)), ctx);
        if (before.deletedAt) return;
        if (id === user.id) {
          throw new AccountRuleError("You cannot remove your own account");
        }
        await keepAnAdmin(user, before, false);
        await repo.remove(user.tenantId, id);
        await repo.revokeSessions(id);
        await auditFor(user, ctx).deleted({ type: "user", id }, snapshot(before));
      });
    },

    async restore(user: SessionUser, id: string, ctx: AccountCtx = {}) {
      return run("restore", user, ctx, id, async () => {
        const before = await load(user, id);
        await authz.assert(user, "restore", resource(user, id, attrs(before)), ctx);
        if (!before.deletedAt) return before;
        const after = await repo.restore(user.tenantId, id);
        await auditFor(user, ctx).restored({ type: "user", id }, snapshot(after));
        return after;
      });
    },
  };
}

export type AccountService = ReturnType<typeof createAccountService>;