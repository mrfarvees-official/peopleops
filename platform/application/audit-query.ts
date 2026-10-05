import { z } from "zod";
import type { SessionUser } from "../domain/auth";
import { humanize, type Option } from "../domain/pbac";
import type { Authorizer } from "./pbac";

export interface AuditRow {
  id: string;
  occurredAt: Date;
  tenantId: string | null;
  actorId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  outcome: "success" | "denied" | "failed";
  reason: string | null;
  requestId: string | null;
  ip: string | null;
  before: unknown;
  after: unknown;
}

export interface AuditFilters {
  tenantId?: string;
  actorId?: string;
  action?: string;
  resourceType?: string;
  outcome?: "success" | "denied" | "failed";
  from?: Date;
  to?: Date; // exclusive upper bound
}

export interface AuditSearch {
  /** Tenants the caller may see. */
  tenantIds: string[];
  /** Entries with no tenant (e.g. failed sign-ins for unknown emails). */
  includeSystem: boolean;
  filters: AuditFilters;
  skip: number;
  take: number;
}

export interface AuditCatalogueRaw {
  tenants: { id: string; name: string }[];
  actors: { id: string; displayName: string; email: string }[];
  actions: string[];
  resourceTypes: string[];
}

export interface AuditQueryRepository {
  search(q: AuditSearch): Promise<{ rows: AuditRow[]; total: number }>;
  get(id: string): Promise<AuditRow | null>;
  catalogue(): Promise<AuditCatalogueRaw>;
}

export class AuditEntryNotFoundError extends Error {
  constructor() {
    super("Audit entry not found");
    this.name = "AuditEntryNotFoundError";
  }
}

export interface QueryLogger {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
  error(obj: object, msg: string): void;
}

export const PAGE_SIZES = [25, 50, 100] as const;

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .transform((s) => new Date(`${s}T00:00:00.000Z`));

// A bad filter value is ignored rather than failing the whole page.
const rawFilters = z.object({
  tenantId: z.string().max(36).optional().catch(undefined),
  actorId: z.string().max(36).optional().catch(undefined),
  action: z.string().max(64).optional().catch(undefined),
  resourceType: z.string().max(64).optional().catch(undefined),
  outcome: z.enum(["success", "denied", "failed"]).optional().catch(undefined),
  from: day.optional().catch(undefined),
  to: day.optional().catch(undefined),
  page: z.coerce.number().int().min(1).catch(1).default(1),
  size: z.coerce
    .number()
    .refine((n) => (PAGE_SIZES as readonly number[]).includes(n))
    .catch(PAGE_SIZES[0])
    .default(PAGE_SIZES[0]),
});

export interface AuditRequestCtx {
  requestId?: string;
  ip?: string;
}

export interface AuditQueryDeps {
  repo: AuditQueryRepository;
  authz: Authorizer;
  log: QueryLogger;
}

export function createAuditQuery({ repo, authz, log }: AuditQueryDeps) {
  const target = (user: SessionUser, tenantId: string | null, id?: string) => ({
    type: "audit_log",
    id,
    tenantId: tenantId ?? user.tenantId,
  });

  // Pipeline: PBAC first, then the work, then log the outcome.
  async function run<T>(
    action: string,
    user: SessionUser,
    ctx: AuditRequestCtx,
    work: () => Promise<T>,
    fields: object = {},
  ): Promise<T> {
    const base = {
      feature: "audit-log",
      action,
      resourceType: "audit_log",
      actorId: user.id,
      tenantId: user.tenantId,
      requestId: ctx.requestId,
      ...fields,
    };
    try {
      const result = await work();
      log.info({ ...base, outcome: "success" }, `audit-log ${action}`);
      return result;
    } catch (e) {
      const name = (e as Error)?.name;
      if (name === "ForbiddenError") {
        log.warn({ ...base, outcome: "denied" }, `audit-log ${action} denied`);
      } else if (name !== "AuditEntryNotFoundError") {
        log.error(
          { ...base, outcome: "failed", err: e },
          `audit-log ${action} failed`,
        );
      }
      throw e;
    }
  }

  return {
    async list(
      user: SessionUser,
      raw: Record<string, string | undefined>,
      ctx: AuditRequestCtx = {},
    ) {
      const { page, size, ...filters } = rawFilters.parse(
        Object.fromEntries(Object.entries(raw).filter(([, v]) => v)),
      );
      return run(
        "viewAny",
        user,
        ctx,
        async () => {
          await authz.assert(user, "viewAny", target(user, null), ctx);

          // Only the tenants this user may view; "no tenant" rows need all of them.
          const { tenants } = await repo.catalogue();
          const visible: string[] = [];
          for (const t of tenants) {
            if (await authz.can(user, "viewAny", target(user, t.id), ctx)) {
              visible.push(t.id);
            }
          }
          const { rows, total } = await repo.search({
            tenantIds: visible,
            includeSystem: visible.length === tenants.length,
            filters,
            skip: (page - 1) * size,
            take: size,
          });
          return { rows, total, page, size, filters };
        },
        { filters: Object.keys(filters) },
      );
    },

    async get(user: SessionUser, id: string, ctx: AuditRequestCtx = {}) {
      return run(
        "view",
        user,
        ctx,
        async () => {
          const row = await repo.get(id);
          if (!row) throw new AuditEntryNotFoundError();
          await authz.assert(user, "view", target(user, row.tenantId, id), ctx);
          return row;
        },
        { resourceId: id },
      );
    },

    /** Dropdown contents for the filter bar, with readable labels. */
    async options(user: SessionUser, ctx: AuditRequestCtx = {}) {
      return run("viewAny", user, ctx, async () => {
        await authz.assert(user, "viewAny", target(user, null), ctx);
        const raw = await repo.catalogue();
        const options: {
          tenants: Option[];
          actors: Option[];
          actions: Option[];
          resources: Option[];
          outcomes: Option[];
        } = {
          tenants: raw.tenants.map((t) => ({ value: t.id, label: t.name })),
          actors: raw.actors.map((a) => ({
            value: a.id,
            label: `${a.displayName} (${a.email})`,
          })),
          actions: raw.actions.map((a) => ({ value: a, label: humanize(a) })),
          resources: raw.resourceTypes.map((r) => ({
            value: r,
            label: humanize(r),
          })),
          outcomes: [
            { value: "success", label: "Success" },
            { value: "denied", label: "Denied" },
            { value: "failed", label: "Failed" },
          ],
        };
        return options;
      });
    },
  };
}

export type AuditQuery = ReturnType<typeof createAuditQuery>;
