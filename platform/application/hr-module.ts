import { ZodError } from "zod";
import type { SessionUser } from "../domain/auth";
import {
  InvalidTransitionError,
  RecordNotFoundError,
  ReadOnlyModuleError,
  ValidationError,
  type FieldDef,
  type FieldOption,
  type RefSource,
} from "../domain/hr";
import { createAudit } from "./audit-api";
import type { AuditWriter } from "./audit-writer";
import { buildSchema, formatZodIssues, serialize, type Rec } from "./hr-fields";
import type { Authorizer } from "./pbac";
import type { SettingsReader } from "./settings";

export type { Rec };

// ─────────────────────────────────────────────────────────────── repositories

export interface ListQuery {
  tenantId: string;
  search?: string;
  filters: Record<string, string>;
  /** Only records owned by, or belonging to a report of, this user. */
  scopeUserId?: string;
  includeDeleted: boolean;
  skip: number;
  take: number;
}

export interface ModuleRepo {
  list(q: ListQuery): Promise<{ rows: Rec[]; total: number }>;
  get(id: string): Promise<Rec | null>;
  create(tenantId: string, data: Record<string, unknown>): Promise<Rec>;
  update(id: string, data: Record<string, unknown>): Promise<Rec>;
  softDelete(id: string): Promise<void>;
  restore(id: string): Promise<void>;
}

/** Dropdown contents by source, always for one tenant and never including deleted rows. */
export interface LookupSource {
  options(source: RefSource, tenantId: string): Promise<FieldOption[]>;
}

export interface HrLogger {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
  error(obj: object, msg: string): void;
}

/** What hooks and actions may use besides their own repository. */
export interface ModuleDeps {
  repos: Record<string, ModuleRepo>;
  settings: SettingsReader;
  now: () => Date;
  /** Employee-linked data (ownerUserId / managerUserId) after an employee changes. */
  syncOwnership(employeeId: string): Promise<void>;
  /** Queries and writes that go beyond one module's own repository. */
  extras: HrExtras;
}

export interface HrExtras {
  /** The employee record linked to a login. */
  employeeByUser(tenantId: string, userId: string): Promise<Rec | null>;
  /** Leave days used (approved or waiting) by an employee for one leave type in a year. */
  leaveUsed(employeeId: string, leaveTypeId: string, year: number, excludeId?: string): Promise<number>;
  /** Existing leave (not rejected, cancelled or deleted) that overlaps the dates. */
  overlappingLeave(employeeId: string, start: Date, end: Date, excludeId?: string): Promise<number>;
  attendanceFor(employeeId: string, day: Date): Promise<Rec | null>;
  /** Replaces a run's payslips from current employees and approved unpaid leave. */
  generatePayslips(
    run: Rec,
    deductionPercent: number,
    by: string,
  ): Promise<{ count: number; gross: number; deductions: number; net: number }>;
  publishPayslips(runId: string): Promise<void>;
}

export interface HookContext {
  user: SessionUser;
  tenantId: string;
  deps: ModuleDeps;
}

// ─────────────────────────────────────────────────────────────────── config

export interface ActionContext extends HookContext {
  record?: Rec;
  note?: string;
  now: Date;
}

export type ActionOutcome =
  | { mode: "update"; data: Record<string, unknown> } // record action: changes to the record
  | { mode: "create"; data: Record<string, unknown> } // collection action: a new record
  | { mode: "update-other"; existing: Rec; data: Record<string, unknown> }; // collection action: change another record

export interface ActionDef {
  key: string;
  label: string;
  /** PBAC action checked against the record. */
  pbacAction: string;
  scope: "record" | "collection";
  /** Statuses the record must be in (record actions). */
  from?: string[];
  /** Status the record moves to. */
  to?: string;
  note?: "optional" | "required";
  tone?: "primary" | "danger";
  /** Extra changes, or the whole outcome for collection actions. */
  run?: (c: ActionContext) => Promise<ActionOutcome | void>;
}

export interface ModuleConfig {
  key: string;
  label: string;
  singular: string;
  /** PBAC resource type. */
  resource: string;
  fields: FieldDef[];
  /** Field keys shown in the list, in order. */
  columns: string[];
  searchable: string[];
  /** Field keys offered as filters. */
  filters: string[];
  /** Narrow lists to the caller's own and their reports' records unless PBAC grants wider access. */
  scoped?: boolean;
  soft?: boolean;
  /** No create, update or delete through the generic API (rows are made by actions). */
  readOnly?: boolean;
  actions?: ActionDef[];
  /** PBAC attributes policies may compare. */
  attrs(rec: Rec): { ownerId?: string | null; managerId?: string | null; status?: string | null };
  /** Fill in derived fields and check cross-record rules before a write. */
  prepare?(c: HookContext, data: Record<string, unknown>, existing?: Rec): Promise<Record<string, unknown>>;
  /** Side effects after a successful create or update. */
  after?(c: HookContext, rec: Rec, before?: Rec): Promise<void>;
}

export interface ModuleDeps2 {
  repo: ModuleRepo;
  lookups: LookupSource;
  authz: Authorizer;
  audit: AuditWriter;
  log: HrLogger;
  deps: ModuleDeps;
}

export interface Ctx {
  requestId?: string;
  ip?: string;
}

const LOOKUP_RESOURCE: Record<RefSource, string> = {
  employees: "employee",
  orgUnits: "org_unit",
  leaveTypes: "leave_type",
};

export const PAGE_SIZES = [25, 50, 100] as const;

/** Most records a restricted (own and reports only) list will look at. */
const RESTRICTED_LIMIT = 5000;

// ───────────────────────────────────────────────────────────────── the module

export function createModule(config: ModuleConfig, d: ModuleDeps2) {
  const { repo, lookups, authz, audit: writer, log, deps } = d;
  const createSchema = buildSchema(config.fields, "create");
  const updateSchema = buildSchema(config.fields, "update");
  const actions = config.actions ?? [];
  const auditable = config.fields.filter((f) => !f.display && !f.readOnly || f.key === "status");

  const resourceOf = (user: SessionUser, rec?: Rec) => ({
    type: config.resource,
    id: rec?.id,
    tenantId: rec?.tenantId ?? user.tenantId,
    ...(rec ? stripNull(config.attrs(rec)) : {}),
  });
  const snapshot = (rec: Rec) => {
    const out = serialize(auditable, rec);
    delete out.createdAt;
    delete out.updatedAt;
    delete out.deletedAt;
    return out;
  };
  const hook = (user: SessionUser, tenantId: string): HookContext => ({ user, tenantId, deps });
  const auditFor = (user: SessionUser, tenantId: string, ctx: Ctx) =>
    createAudit(writer, { tenantId, actorId: user.id, ...ctx });

  // Pipeline: PBAC first (inside the work), then the work, then log the outcome.
  async function run<T>(
    action: string,
    user: SessionUser,
    ctx: Ctx,
    fields: object,
    work: () => Promise<T>,
  ): Promise<T> {
    const base = {
      feature: `hr.${config.key}`,
      action,
      resourceType: config.resource,
      actorId: user.id,
      tenantId: user.tenantId,
      requestId: ctx.requestId,
      ...fields,
    };
    try {
      const result = await work();
      log.info({ ...base, outcome: "success" }, `hr ${config.key} ${action}`);
      return result;
    } catch (e) {
      const name = (e as Error)?.name;
      if (name === "ForbiddenError") {
        log.warn({ ...base, outcome: "denied" }, `hr ${config.key} ${action} denied`);
      } else if (
        ["ValidationError", "RecordNotFoundError", "ConflictError", "InvalidTransitionError", "ReadOnlyModuleError"].includes(name)
      ) {
        log.warn({ ...base, outcome: "failed", reason: (e as Error).message }, `hr ${config.key} ${action} rejected`);
      } else {
        log.error({ ...base, outcome: "failed", err: e }, `hr ${config.key} ${action} failed`);
      }
      throw e;
    }
  }

  function parse(mode: "create" | "update", input: unknown) {
    try {
      return (mode === "create" ? createSchema : updateSchema).parse(input) as Record<string, unknown>;
    } catch (e) {
      if (e instanceof ZodError) throw new ValidationError("Invalid input", formatZodIssues(e));
      throw e;
    }
  }

  async function load(id: string): Promise<Rec> {
    const rec = await repo.get(id);
    if (!rec) throw new RecordNotFoundError(`${config.singular} not found`);
    return rec;
  }

  /** What the caller may do with each record, from one policy load. */
  async function abilities(user: SessionUser, recs: Rec[], ctx: Ctx) {
    const requests: { action: string; resource: ReturnType<typeof resourceOf> }[] = [];
    const plan = recs.map((rec) => {
      const res = resourceOf(user, rec);
      const status = config.attrs(rec).status ?? undefined;
      const wanted: { name: string; action: string; include: boolean }[] = [
        { name: "view", action: "view", include: true },
        { name: "update", action: "update", include: !config.readOnly && !rec.deletedAt },
        { name: "delete", action: "delete", include: !config.readOnly && !!config.soft && !rec.deletedAt },
        { name: "restore", action: "restore", include: !config.readOnly && !!config.soft && !!rec.deletedAt },
        ...actions
          .filter((a) => a.scope === "record")
          .map((a) => ({
            name: `action:${a.key}`,
            action: a.pbacAction,
            include: !rec.deletedAt && (!a.from || (status !== undefined && a.from.includes(status))),
          })),
      ].filter((w) => w.include);
      const start = requests.length;
      for (const w of wanted) requests.push({ action: w.action, resource: res });
      return { rec, wanted, start };
    });
    const decisions = await authz.authorizeMany(user, requests, ctx);
    return plan.map(({ rec, wanted, start }) => {
      const allowed = new Set(wanted.filter((_, i) => decisions[start + i].allowed).map((w) => w.name));
      return { rec, allowed };
    });
  }

  function present(user: SessionUser, rec: Rec, allowed: Set<string>) {
    const out = serialize(config.fields, rec);
    const owner = config.attrs(rec).ownerId;
    const seesSensitive = allowed.has("update") || (owner != null && owner === user.id);
    if (!seesSensitive) for (const f of config.fields) if (f.sensitive) delete out[f.key];
    return {
      ...out,
      _can: {
        update: allowed.has("update"),
        delete: allowed.has("delete"),
        restore: allowed.has("restore"),
        actions: actions.filter((a) => allowed.has(`action:${a.key}`)).map((a) => a.key),
      },
    };
  }

  return {
    config,

    /** Everything the UI needs to draw this module. */
    async meta(user: SessionUser, ctx: Ctx = {}) {
      const canCreate =
        !config.readOnly &&
        (await authz.can(user, "create", { type: config.resource, tenantId: user.tenantId, ownerId: user.id }, ctx));
      const collectionActions = actions.filter((a) => a.scope === "collection");
      const allowedCollection: string[] = [];
      for (const a of collectionActions) {
        if (await authz.can(user, a.pbacAction, { type: config.resource, tenantId: user.tenantId, ownerId: user.id }, ctx)) {
          allowedCollection.push(a.key);
        }
      }
      return {
        key: config.key,
        label: config.label,
        singular: config.singular,
        resource: config.resource,
        readOnly: !!config.readOnly,
        soft: !!config.soft,
        fields: config.fields,
        columns: config.columns,
        searchable: config.searchable,
        filters: config.filters,
        actions: actions.map((a) => ({
          key: a.key, label: a.label, scope: a.scope, note: a.note ?? null, tone: a.tone ?? null,
        })),
        can: { create: canCreate, collectionActions: allowedCollection },
      };
    },

    /** Dropdown options for ref fields and filters, limited to what the caller may list. */
    async options(user: SessionUser, ctx: Ctx = {}) {
      const sources = new Set<RefSource>();
      for (const f of config.fields) if (f.ref) sources.add(f.ref);
      const out: Partial<Record<RefSource, FieldOption[]>> = {};
      for (const s of sources) {
        // "view" without a record means unrestricted access: people who may only see
        // their own record (or their team's) must not get the whole list as a dropdown.
        const ok = await authz.can(user, "view", { type: LOOKUP_RESOURCE[s], tenantId: user.tenantId }, ctx);
        out[s] = ok ? await lookups.options(s, user.tenantId) : [];
      }
      return out;
    },

    async list(
      user: SessionUser,
      q: { search?: string; filters?: Record<string, string>; page?: number; size?: number; deleted?: boolean },
      ctx: Ctx = {},
    ) {
      const size = (PAGE_SIZES as readonly number[]).includes(q.size ?? 0) ? q.size! : PAGE_SIZES[0];
      const page = Math.max(1, Math.floor(q.page ?? 1) || 1);
      return run("viewAny", user, ctx, {}, async () => {
        await authz.assert(user, "viewAny", { type: config.resource, tenantId: user.tenantId }, ctx);

        // Roles that may view every record see them all; others see their own and their reports'.
        const full =
          !config.scoped ||
          (await authz.can(user, "view", { type: config.resource, tenantId: user.tenantId }, ctx));
        const filters: Record<string, string> = {};
        for (const k of config.filters) if (q.filters?.[k]) filters[k] = q.filters[k];

        const query = {
          tenantId: user.tenantId,
          search: q.search?.trim() || undefined,
          filters,
          scopeUserId: full ? undefined : user.id,
          includeDeleted: !!q.deleted && !!config.soft,
        };

        if (full) {
          // Unrestricted access: the database pages, every row is visible.
          const { rows, total } = await repo.list({ ...query, skip: (page - 1) * size, take: size });
          const checked = await abilities(user, rows, ctx);
          return { rows: checked.map((c) => present(user, c.rec, c.allowed)), total, page, size };
        }

        // Restricted access: the rows that are theirs or their reports' are few, so
        // check every one against the policies first, then page. That keeps the
        // total (and the page count) exact instead of counting rows they cannot open.
        const { rows: scoped } = await repo.list({ ...query, skip: 0, take: RESTRICTED_LIMIT });
        const views = await authz.authorizeMany(
          user,
          scoped.map((r) => ({ action: "view", resource: resourceOf(user, r) })),
          ctx,
        );
        const allowed = scoped.filter((_, i) => views[i].allowed);
        const slice = allowed.slice((page - 1) * size, page * size);
        const checked = await abilities(user, slice, ctx);
        return { rows: checked.map((c) => present(user, c.rec, c.allowed)), total: allowed.length, page, size };
      });
    },

    async get(user: SessionUser, id: string, ctx: Ctx = {}) {
      return run("view", user, ctx, { resourceId: id }, async () => {
        const rec = await load(id);
        // The resource carries the record's own tenant, so another company's
        // record is refused by the cross-tenant deny policy.
        await authz.assert(user, "view", resourceOf(user, rec), ctx);
        const [one] = await abilities(user, [rec], ctx);
        return present(user, rec, one.allowed);
      });
    },

    async create(user: SessionUser, input: unknown, ctx: Ctx = {}) {
      return run("create", user, ctx, {}, async () => {
        if (config.readOnly) throw new ReadOnlyModuleError(`${config.label} cannot be created directly`);
        // PBAC first: someone who could never create this (even for themselves)
        // is refused before their input is looked at. The exact check, with the
        // record's real owner and manager, follows once the input is understood.
        if (!(await authz.can(user, "create", { type: config.resource, tenantId: user.tenantId, ownerId: user.id }, ctx))) {
          await authz.assert(user, "create", { type: config.resource, tenantId: user.tenantId }, ctx);
        }
        const parsed = parse("create", input);
        const data = config.prepare ? await config.prepare(hook(user, user.tenantId), parsed) : parsed;
        // PBAC sees the record as it would be stored (owner, manager, status).
        const prospective = { tenantId: user.tenantId, ...data } as Rec;
        await authz.assert(user, "create", resourceOf(user, prospective), ctx);

        const rec = await repo.create(user.tenantId, data);
        await config.after?.(hook(user, user.tenantId), rec);
        await auditFor(user, rec.tenantId, ctx).created({ type: config.resource, id: rec.id }, snapshot(rec));
        const [one] = await abilities(user, [rec], ctx);
        return present(user, rec, one.allowed);
      });
    },

    async update(user: SessionUser, id: string, input: unknown, ctx: Ctx = {}) {
      return run("update", user, ctx, { resourceId: id }, async () => {
        if (config.readOnly) throw new ReadOnlyModuleError(`${config.label} cannot be changed directly`);
        const before = await load(id);
        await authz.assert(user, "update", resourceOf(user, before), ctx);
        const parsed = parse("update", input);
        const data = config.prepare ? await config.prepare(hook(user, before.tenantId), parsed, before) : parsed;

        // Ownership may not be handed to someone else's record without the right to do so.
        const next = { ...before, ...data } as Rec;
        if (config.attrs(next).ownerId !== config.attrs(before).ownerId) {
          await authz.assert(user, "update", resourceOf(user, next), ctx);
        }

        const rec = await repo.update(id, data);
        await config.after?.(hook(user, rec.tenantId), rec, before);
        await auditFor(user, rec.tenantId, ctx).updated({ type: config.resource, id }, snapshot(before), snapshot(rec));
        const [one] = await abilities(user, [rec], ctx);
        return present(user, rec, one.allowed);
      });
    },

    async remove(user: SessionUser, id: string, ctx: Ctx = {}) {
      return run("delete", user, ctx, { resourceId: id }, async () => {
        if (config.readOnly || !config.soft) throw new ReadOnlyModuleError(`${config.label} cannot be deleted`);
        const before = await load(id);
        await authz.assert(user, "delete", resourceOf(user, before), ctx);
        await repo.softDelete(id);
        await auditFor(user, before.tenantId, ctx).deleted({ type: config.resource, id }, snapshot(before));
      });
    },

    async restore(user: SessionUser, id: string, ctx: Ctx = {}) {
      return run("restore", user, ctx, { resourceId: id }, async () => {
        if (config.readOnly || !config.soft) throw new ReadOnlyModuleError(`${config.label} cannot be restored`);
        const before = await load(id);
        await authz.assert(user, "restore", resourceOf(user, before), ctx);
        await repo.restore(id);
        const rec = await load(id);
        await auditFor(user, rec.tenantId, ctx).restored({ type: config.resource, id }, snapshot(rec));
        const [one] = await abilities(user, [rec], ctx);
        return present(user, rec, one.allowed);
      });
    },

    /** A workflow step: approve, reject, submit, clock in, lock, publish, ... */
    async act(
      user: SessionUser,
      key: string,
      id: string | null,
      input: { note?: string } = {},
      ctx: Ctx = {},
    ) {
      return run(key, user, ctx, { resourceId: id ?? undefined }, async () => {
        const def = actions.find((a) => a.key === key);
        if (!def) throw new RecordNotFoundError(`Unknown action: ${key}`);
        const note = input.note?.trim() || undefined;
        if (def.note === "required" && !note) throw new ValidationError("A note is required", [{ field: "note", message: "required" }]);
        if (note && note.length > 255) throw new ValidationError("The note is too long", [{ field: "note", message: "at most 255 characters" }]);
        const now = deps.now();
        const c = (record?: Rec): ActionContext => ({ ...hook(user, record?.tenantId ?? user.tenantId), record, note, now });

        if (def.scope === "collection") {
          const out = await def.run!(c());
          if (!out) throw new InvalidTransitionError("Nothing to do");
          const probe =
            out.mode === "create"
              ? ({ id: undefined as never, tenantId: user.tenantId, ...out.data } as Rec)
              : out.mode === "update-other"
                ? ({ ...out.existing, ...out.data } as Rec)
                : (undefined as never);
          await authz.assert(user, def.pbacAction, resourceOf(user, probe), ctx);
          const rec =
            out.mode === "create"
              ? await repo.create(user.tenantId, out.data)
              : out.mode === "update-other"
                ? await repo.update(out.existing.id, out.data)
                : (undefined as never);
          await auditFor(user, rec.tenantId, ctx).transitioned(
            { type: config.resource, id: rec.id },
            key,
            out.mode === "update-other" ? snapshot(out.existing) : {},
            snapshot(rec),
          );
          const [one] = await abilities(user, [rec], ctx);
          return present(user, rec, one.allowed);
        }

        if (!id) throw new RecordNotFoundError(`${config.singular} not found`);
        const before = await load(id);
        const status = config.attrs(before).status ?? null;
        await authz.assert(user, def.pbacAction, resourceOf(user, before), ctx);
        if (def.from && (status === null || !def.from.includes(status))) {
          throw new InvalidTransitionError(`Cannot ${def.label.toLowerCase()} a ${config.singular.toLowerCase()} that is ${status ?? "in this state"}`);
        }
        const extra = (await def.run?.(c(before))) ?? undefined;
        const patch = { ...(def.to ? { status: def.to } : {}), ...(extra && extra.mode === "update" ? extra.data : {}) };
        const rec = await repo.update(id, patch);
        await config.after?.(hook(user, rec.tenantId), rec, before);
        await auditFor(user, rec.tenantId, ctx).transitioned(
          { type: config.resource, id },
          key,
          snapshot(before),
          { ...snapshot(rec), ...(note ? { note } : {}) },
        );
        const [one] = await abilities(user, [rec], ctx);
        return present(user, rec, one.allowed);
      });
    },
  };
}

export type HrModule = ReturnType<typeof createModule>;

function stripNull<T extends Record<string, unknown>>(o: T): Partial<{ [K in keyof T]: NonNullable<T[K]> }> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined)) as never;
}
