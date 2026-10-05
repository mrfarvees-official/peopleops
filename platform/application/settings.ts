import type { SessionUser } from "../domain/auth";
import {
  SETTINGS,
  UnknownSettingError,
  findSetting,
  parseSettingValue,
  type SettingDef,
} from "../domain/settings";
import { createAudit } from "./audit-api";
import type { AuditWriter } from "./audit-writer";
import type { Authorizer } from "./pbac";

export interface StoredSetting {
  key: string;
  value: unknown;
  version: number;
  updatedAt: Date;
  updatedBy: string | null;
}

export interface SettingsRepository {
  all(): Promise<StoredSetting[]>;
  upsert(
    key: string,
    value: number | string,
    actorId: string,
  ): Promise<StoredSetting>;
}

export interface SettingView {
  key: string;
  group: string;
  label: string;
  description: string;
  type: SettingDef["type"];
  value: number | string;
  default: number | string;
  isDefault: boolean;
  version: number | null;
  updatedAt: Date | null;
  updatedBy: string | null;
}

export interface SettingsLogger {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
  error(obj: object, msg: string): void;
}

/**
 * Cheap, cached reads for code that runs on every request. No PBAC here: this
 * is the engine reading its own configuration, never exposed to users.
 */
export function createSettingsReader(repo: SettingsRepository, ttlMs = 5000) {
  let cache: { at: number; values: Map<string, unknown> } | null = null;

  async function load() {
    if (cache && Date.now() - cache.at < ttlMs) return cache.values;
    const values = new Map((await repo.all()).map((s) => [s.key, s.value]));
    cache = { at: Date.now(), values };
    return values;
  }

  async function get(key: string): Promise<number | string> {
    const def = findSetting(key);
    if (!def) throw new UnknownSettingError(key);
    const stored = (await load()).get(key);
    if (stored === undefined) return def.default;
    try {
      return parseSettingValue(def, stored);
    } catch {
      return def.default; // a bad stored value must never break the app
    }
  }

  return {
    get,
    async getFlag(key: string): Promise<boolean> {
      return (await get(key)) === 1;
    },
    /** Call after a write so this instance sees it immediately. */
    invalidate() {
      cache = null;
    },
  };
}

export type SettingsReader = ReturnType<typeof createSettingsReader>;

export interface SettingsAdminDeps {
  repo: SettingsRepository;
  reader: SettingsReader;
  authz: Authorizer;
  audit: AuditWriter;
  log: SettingsLogger;
}

interface Ctx {
  requestId?: string;
  ip?: string;
}

export function createSettingsAdmin({
  repo,
  reader,
  authz,
  audit: writer,
  log,
}: SettingsAdminDeps) {
  const target = (user: SessionUser, key?: string) => ({
    type: "setting",
    id: key,
    tenantId: user.tenantId,
  });

  const view = (def: SettingDef, s?: StoredSetting): SettingView => {
    let value: number | string = def.default;
    if (s) {
      try {
        value = parseSettingValue(def, s.value);
      } catch {
        /* keep the default */
      }
    }
    return {
      key: def.key,
      group: def.group,
      label: def.label,
      description: def.description,
      type: def.type,
      value,
      default: def.default,
      isDefault: value === def.default,
      version: s?.version ?? null,
      updatedAt: s?.updatedAt ?? null,
      updatedBy: s?.updatedBy ?? null,
    };
  };

  // Pipeline: PBAC first, then the work, then log the outcome.
  async function run<T>(
    action: string,
    user: SessionUser,
    ctx: Ctx,
    fields: object,
    work: () => Promise<T>,
  ): Promise<T> {
    const base = {
      feature: "settings",
      action,
      resourceType: "setting",
      actorId: user.id,
      tenantId: user.tenantId,
      requestId: ctx.requestId,
      ...fields,
    };
    try {
      const result = await work();
      log.info({ ...base, outcome: "success" }, `settings ${action}`);
      return result;
    } catch (e) {
      const name = (e as Error)?.name;
      if (name === "ForbiddenError") {
        log.warn({ ...base, outcome: "denied" }, `settings ${action} denied`);
      } else if (
        name === "UnknownSettingError" ||
        name === "InvalidSettingValueError"
      ) {
        log.warn(
          { ...base, outcome: "failed", reason: (e as Error).message },
          `settings ${action} rejected`,
        );
      } else {
        log.error(
          { ...base, outcome: "failed", err: e },
          `settings ${action} failed`,
        );
      }
      throw e;
    }
  }

  return {
    async list(user: SessionUser, ctx: Ctx = {}): Promise<SettingView[]> {
      return run("viewAny", user, ctx, {}, async () => {
        await authz.assert(user, "viewAny", target(user), ctx);
        const stored = new Map((await repo.all()).map((s) => [s.key, s]));
        return SETTINGS.map((d) => view(d, stored.get(d.key)));
      });
    },

    async get(
      user: SessionUser,
      key: string,
      ctx: Ctx = {},
    ): Promise<SettingView> {
      return run("view", user, ctx, { resourceId: key }, async () => {
        const def = findSetting(key);
        if (!def) throw new UnknownSettingError(key);
        await authz.assert(user, "view", target(user, key), ctx);
        const s = (await repo.all()).find((x) => x.key === key);
        return view(def, s);
      });
    },

    async set(
      user: SessionUser,
      key: string,
      raw: unknown,
      ctx: Ctx = {},
    ): Promise<SettingView> {
      return run("update", user, ctx, { resourceId: key }, async () => {
        const def = findSetting(key);
        if (!def) throw new UnknownSettingError(key);
        await authz.assert(user, "update", target(user, key), ctx);
        const value = parseSettingValue(def, raw);

        const before = (await repo.all()).find((x) => x.key === key);
        const saved = await repo.upsert(key, value, user.id);
        reader.invalidate();

        await createAudit(writer, {
          tenantId: user.tenantId,
          actorId: user.id,
          ...ctx,
        }).updated(
          { type: "setting", id: key },
          { value: before ? before.value : def.default },
          { value },
        );
        return view(def, saved);
      });
    },
  };
}

export type SettingsAdmin = ReturnType<typeof createSettingsAdmin>;
