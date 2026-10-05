import { describe, expect, it } from "vitest";
import { createAuthService } from "@/platform/application/auth";
import type {
  AuthRepository,
  AuthUserRecord,
  StoredSession,
} from "@/platform/application/auth-ports";
import { InMemoryAuditWriter } from "@/platform/infrastructure/in-memory-audit-writer";
import {
  hashPassword,
  verifyPassword,
} from "@/platform/infrastructure/scrypt-password-hasher";

async function setup(over: Partial<AuthUserRecord> = {}) {
  const user: AuthUserRecord = {
    id: "u1",
    tenantId: "t1",
    email: "a@demo.com",
    displayName: "A",
    passwordHash: await hashPassword("correct-horse-battery"),
    status: "active",
    tenantActive: true,
    roles: ["employee"],
    ...over,
  };
  const sessions = new Map<string, StoredSession & { tokenHash: string }>();
  const repo: AuthRepository = {
    findUsersByEmail: async (e) => (e === user.email ? [user] : []),
    createSession: async (s) => {
      const id = `s${sessions.size + 1}`;
      sessions.set(s.tokenHash, {
        id,
        tokenHash: s.tokenHash,
        expiresAt: s.expiresAt,
        revokedAt: null,
        lastSeenAt: new Date(),
        user,
      });
      return { id };
    },
    findSession: async (h) => sessions.get(h) ?? null,
    touchSession: async () => {},
    revokeSession: async (id) => {
      for (const s of sessions.values())
        if (s.id === id) s.revokedAt = new Date();
    },
  };
  const audit = new InMemoryAuditWriter();
  const auth = createAuthService({
    repo,
    audit,
    hasher: { hash: hashPassword, verify: verifyPassword },
    ttlMs: 60_000,
  });
  return { auth, audit };
}

const good = { email: "A@demo.com", password: "correct-horse-battery" };

describe("auth service", () => {
  it("logs in, resolves the session, and logs out", async () => {
    const { auth, audit } = await setup();
    const { token, user } = await auth.login(good);
    expect(user).toEqual({
      id: "u1",
      tenantId: "t1",
      email: "a@demo.com",
      displayName: "A",
      roles: ["employee"],
    });
    expect((await auth.getSession(token))?.id).toBe("u1");
    await auth.logout(token);
    expect(await auth.getSession(token)).toBeNull();
    expect(audit.entries.map((e) => e.action)).toEqual([
      "session.create",
      "session.revoke",
    ]);
  });

  it("rejects a wrong password and audits it as denied", async () => {
    const { auth, audit } = await setup();
    await expect(auth.login({ ...good, password: "nope" })).rejects.toThrow(
      "Invalid credentials",
    );
    expect(audit.entries[0]).toMatchObject({
      outcome: "denied",
      reason: "bad_password",
    });
  });

  it("gives the same error for unknown users and suspended accounts", async () => {
    await expect(
      (await setup()).auth.login({ ...good, email: "x@demo.com" }),
    ).rejects.toThrow("Invalid credentials");
    await expect(
      (await setup({ status: "suspended" })).auth.login(good),
    ).rejects.toThrow("Invalid credentials");
  });

  it("rejects an unknown token", async () => {
    expect(await (await setup()).auth.getSession("garbage")).toBeNull();
  });
});

describe("sign-in failures", () => {
  it("name the error so callers can recognise it after a hot reload", async () => {
    const { InvalidCredentialsError } = await import("@/platform/domain/auth");
    expect(new InvalidCredentialsError().name).toBe("InvalidCredentialsError");
  });
});
