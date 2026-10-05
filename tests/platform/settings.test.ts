import { describe, expect, it } from "vitest";
import { createAuthorizer } from "@/platform/application/pbac";
import type { PolicyRepository } from "@/platform/application/pbac-ports";
import {
  createSettingsAdmin,
  createSettingsReader,
  type SettingsRepository,
  type StoredSetting,
} from "@/platform/application/settings";
import type { SessionUser } from "@/platform/domain/auth";
import type { Policy } from "@/platform/domain/pbac";
import { LOG_VIEWS_KEY, findSetting, parseSettingValue } from "@/platform/domain/settings";
import { InMemoryAuditWriter } from "@/platform/infrastructure/in-memory-audit-writer";

const allowAll: Policy = {
  id: "p1",
  code: "super-admin-full-access",
  effect: "allow",
  subjects: [{ type: "role", role: "super_admin" }],
  targets: [{ action: null, resource: null }],
  conditions: [],
};

const user = (roles: string[]): SessionUser => ({
  id: "u1",
  tenantId: "t1",
  email: "a@b.c",
  displayName: "A",
  roles,
});

function memoryRepo(): SettingsRepository & { rows: Map<string, StoredSetting> } {
  const rows = new Map<string, StoredSetting>();
  return {
    rows,
    all: async () => [...rows.values()],
    upsert: async (key, value, actorId) => {
      const prev = rows.get(key);
      const row = {
        key,
        value,
        version: (prev?.version ?? 0) + 1,
        updatedAt: new Date(),
        updatedBy: actorId,
      };
      rows.set(key, row);
      return row;
    },
  };
}

function setup() {
  const repo = memoryRepo();
  const reader = createSettingsReader(repo, 60_000);
  const policies: PolicyRepository = { findApplicable: async () => [allowAll] };
  // The writer and authorizer read the setting the same way the server does.
  const logViews = () => reader.getFlag(LOG_VIEWS_KEY);
  const audit = new InMemoryAuditWriter(logViews);
  const authz = createAuthorizer({ repo: policies, audit, logViews });
  const logs: { level: string; obj: Record<string, unknown> }[] = [];
  const log = {
    info: (obj: object) => logs.push({ level: "info", obj: obj as never }),
    warn: (obj: object) => logs.push({ level: "warn", obj: obj as never }),
    error: (obj: object) => logs.push({ level: "error", obj: obj as never }),
  };
  const admin = createSettingsAdmin({ repo, reader, authz, audit, log });
  return { repo, reader, audit, authz, admin, logs };
}

describe("setting values", () => {
  const def = findSetting(LOG_VIEWS_KEY)!;

  it("accepts 0 and 1 in the usual spellings", () => {
    expect(parseSettingValue(def, 1)).toBe(1);
    expect(parseSettingValue(def, "0")).toBe(0);
    expect(parseSettingValue(def, true)).toBe(1);
    expect(parseSettingValue(def, false)).toBe(0);
  });

  it("rejects anything else", () => {
    for (const bad of [2, -1, "yes", null, undefined, 0.5]) {
      expect(() => parseSettingValue(def, bad)).toThrow(/expected 0 or 1/);
    }
  });
});

describe("log views setting", () => {
  const res = { type: "employee", id: "e1", tenantId: "t1" };

  it("defaults to off: views and lists are not written", async () => {
    const { authz, audit } = setup();
    await authz.assert(user(["super_admin"]), "view", res);
    await authz.assert(user(["super_admin"]), "viewAny", res);
    expect(audit.entries).toHaveLength(0);
  });

  it("when on, views and lists are written", async () => {
    const { authz, audit, admin } = setup();
    await admin.set(user(["super_admin"]), LOG_VIEWS_KEY, 1);
    audit.entries.length = 0; // ignore the settings change itself
    await authz.assert(user(["super_admin"]), "view", res);
    await authz.assert(user(["super_admin"]), "viewAny", { type: "employee", tenantId: "t1" });
    expect(audit.entries.map((e) => e.action)).toEqual(["employee.view", "employee.viewAny"]);
  });

  it("turning it back off mutes them again", async () => {
    const { authz, audit, admin } = setup();
    const sa = user(["super_admin"]);
    await admin.set(sa, LOG_VIEWS_KEY, 1);
    await admin.set(sa, LOG_VIEWS_KEY, 0);
    audit.entries.length = 0;
    await authz.assert(sa, "view", res);
    expect(audit.entries).toHaveLength(0);
  });

  it("never logs reads of the audit log itself", async () => {
    const { authz, audit, admin } = setup();
    const sa = user(["super_admin"]);
    await admin.set(sa, LOG_VIEWS_KEY, 1);
    audit.entries.length = 0;
    await authz.assert(sa, "viewAny", { type: "audit_log", tenantId: "t1" });
    expect(audit.entries).toHaveLength(0);
  });

  it("does not mute denied attempts or changes", async () => {
    const { authz, audit } = setup();
    await expect(
      authz.assert(user(["employee"]), "view", res),
    ).rejects.toMatchObject({ name: "ForbiddenError" });
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({ action: "employee.view", outcome: "denied" });
  });

  it("system_developer views are muted by default too, and recorded when on", async () => {
    const { authz, audit, admin } = setup();
    const dev = user(["system_developer"]);
    await authz.assert(dev, "view", res);
    expect(audit.entries).toHaveLength(0);

    await admin.set(dev, LOG_VIEWS_KEY, 1);
    audit.entries.length = 0;
    await authz.assert(dev, "view", res);
    expect(audit.entries.map((e) => e.action).sort()).toEqual(["employee.view", "pbac.bypass"]);
  });

  it("bypass of a non-view action is always recorded", async () => {
    const { authz, audit } = setup();
    await authz.assert(user(["system_developer"]), "delete", res);
    expect(audit.entries[0]).toMatchObject({ action: "pbac.bypass" });
  });
});

describe("settings admin", () => {
  it("lists settings with defaults, then the stored value", async () => {
    const { admin } = setup();
    const sa = user(["super_admin"]);
    expect((await admin.list(sa))[0]).toMatchObject({
      key: LOG_VIEWS_KEY,
      value: 0,
      isDefault: true,
      version: null,
    });
    await admin.set(sa, LOG_VIEWS_KEY, "1");
    expect(await admin.get(sa, LOG_VIEWS_KEY)).toMatchObject({
      value: 1,
      isDefault: false,
      version: 1,
      updatedBy: "u1",
    });
  });

  it("audits a change with before and after", async () => {
    const { admin, audit } = setup();
    await admin.set(user(["super_admin"]), LOG_VIEWS_KEY, 1);
    expect(audit.entries[0]).toMatchObject({
      action: "setting.update",
      resourceId: LOG_VIEWS_KEY,
      before: { value: 0 },
      after: { value: 1 },
    });
  });

  it("only users PBAC allows can read or change settings", async () => {
    const { admin, repo, logs } = setup();
    await expect(admin.set(user(["employee"]), LOG_VIEWS_KEY, 1)).rejects.toMatchObject({
      name: "ForbiddenError",
    });
    await expect(admin.list(user(["hr_admin"]))).rejects.toMatchObject({ name: "ForbiddenError" });
    expect(repo.rows.size).toBe(0);
    expect(logs.at(-1)).toMatchObject({ level: "warn", obj: { feature: "settings", outcome: "denied" } });
  });

  it("system_developer can change settings through the bypass", async () => {
    const { admin } = setup();
    expect(await admin.set(user(["system_developer"]), LOG_VIEWS_KEY, 1)).toMatchObject({ value: 1 });
  });

  it("rejects unknown keys and bad values without writing", async () => {
    const { admin, repo, logs } = setup();
    const sa = user(["super_admin"]);
    await expect(admin.set(sa, "nope", 1)).rejects.toMatchObject({ name: "UnknownSettingError" });
    await expect(admin.set(sa, LOG_VIEWS_KEY, 5)).rejects.toMatchObject({
      name: "InvalidSettingValueError",
    });
    expect(repo.rows.size).toBe(0);
    expect(logs.at(-1)).toMatchObject({ level: "warn", obj: { outcome: "failed" } });
  });

  it("logs each successful action", async () => {
    const { admin, logs } = setup();
    await admin.set(user(["super_admin"]), LOG_VIEWS_KEY, 1);
    expect(logs.at(-1)).toMatchObject({
      level: "info",
      obj: { feature: "settings", action: "update", resourceId: LOG_VIEWS_KEY, outcome: "success" },
    });
  });
});
