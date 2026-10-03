import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import {
  InvalidCredentialsError,
  canAuthenticate,
  normalizeEmail,
  type SessionUser,
} from "../domain/auth";
import type { AuditWriter } from "./audit-writer";
import { createAudit } from "./audit-api";
import type { AuthRepository, AuthUserRecord, PasswordHasher } from "./auth-ports";

const loginInput = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(200),
});

export interface RequestInfo {
  ip?: string;
  userAgent?: string;
}

export interface AuthDeps {
  repo: AuthRepository;
  hasher: PasswordHasher;
  audit: AuditWriter;
  ttlMs: number;
  now?: () => Date;
}

const TOUCH_EVERY_MS = 60_000;
const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export function createAuthService(deps: AuthDeps) {
  const { repo, hasher, audit: writer, ttlMs } = deps;
  const now = deps.now ?? (() => new Date());
  // Verified against when the user doesn't exist, so timing doesn't reveal valid emails.
  const dummyHash = hasher.hash(randomBytes(16).toString("hex"));

  async function login(
    raw: unknown,
    req: RequestInfo = {},
  ): Promise<{ token: string; expiresAt: Date; user: SessionUser }> {
    const input = loginInput.parse(raw);
    const candidates = await repo.findUsersByEmail(normalizeEmail(input.email));

    // Keep timing similar whether or not the email exists.
    if (candidates.length === 0) {
      await hasher.verify(input.password, await dummyHash);
    }
    const matched: AuthUserRecord[] = [];
    for (const c of candidates) {
      if (await hasher.verify(input.password, c.passwordHash)) matched.push(c);
    }
    const user = matched.find(canAuthenticate) ?? matched[0] ?? null;

    const audit = createAudit(writer, {
      tenantId: user?.tenantId ?? candidates[0]?.tenantId,
      actorId: user?.id ?? candidates[0]?.id,
      ip: req.ip,
    });

    if (!user || !canAuthenticate(user)) {
      const reason =
        candidates.length === 0
          ? "unknown_user"
          : !user
            ? "bad_password"
            : "account_not_active";
      await audit.denied("login", { type: "session" }, reason);
      throw new InvalidCredentialsError();
    }

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(now().getTime() + ttlMs);
    const { id } = await repo.createSession({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt,
      ip: req.ip,
      userAgent: req.userAgent?.slice(0, 255),
    });
    await audit.created({ type: "session", id }, { userId: user.id });

    return {
      token,
      expiresAt,
      user: {
        id: user.id,
        tenantId: user.tenantId,
        email: user.email,
        displayName: user.displayName,
        roles: user.roles,
      },
    };
  }

  async function getSession(token: string | undefined) {
    if (!token) return null;
    const s = await repo.findSession(hashToken(token));
    if (!s || s.revokedAt || s.expiresAt <= now() || !canAuthenticate(s.user)) {
      return null;
    }
    if (now().getTime() - s.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
      await repo.touchSession(s.id, now());
    }
    const u = s.user;
    return {
      id: u.id,
      tenantId: u.tenantId,
      email: u.email,
      displayName: u.displayName,
      roles: u.roles,
    } satisfies SessionUser;
  }

  async function logout(token: string | undefined, req: RequestInfo = {}) {
    if (!token) return;
    const s = await repo.findSession(hashToken(token));
    if (!s || s.revokedAt) return;
    await repo.revokeSession(s.id);
    await createAudit(writer, {
      tenantId: s.user.tenantId,
      actorId: s.user.id,
      ip: req.ip,
    }).transitioned({ type: "session", id: s.id }, "revoke", {}, {});
  }

  return { login, getSession, logout };
}

export type AuthService = ReturnType<typeof createAuthService>;
