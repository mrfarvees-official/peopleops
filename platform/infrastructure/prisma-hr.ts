/* eslint-disable @typescript-eslint/no-explicit-any */
import type { PrismaClient } from "../../prisma/app/generated/prisma/client";
import type {
  HrExtras,
  ListQuery,
  LookupSource,
  ModuleRepo,
  Rec,
} from "../application/hr-module";
import {
  ConflictError,
  RecordNotFoundError,
  computePayslip,
  periodBounds,
  weekdaysWithin,
  type FieldOption,
  type RefSource,
} from "../domain/hr";

/** Prisma returns Decimal objects; the application works with plain numbers. */
function plain(row: Record<string, any>): Rec {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = v !== null && typeof v === "object" && typeof (v as any).toNumber === "function" ? (v as any).toNumber() : v;
  }
  return out as Rec;
}

const fullName = (p?: { firstName: string; lastName: string } | null) => (p ? `${p.firstName} ${p.lastName}` : null);

/** Names the field(s) behind a unique-key clash, e.g. hr_org_unit_tenantId_code_key -> "code". */
function uniqueFields(e: unknown): string {
  const cause = (e as any)?.meta?.driverAdapterError?.cause;
  const index: string = cause?.constraint?.index ?? "";
  const table: string = cause?.table ?? "";
  const fields = index
    .replace(`${table}_`, "")
    .replace(/_key$/, "")
    .split("_")
    .filter((f) => f && f !== "tenantId");
  return fields.length ? fields.join(" and ") : "value";
}

/** Turns database errors into the domain's own, so the API can answer clearly. */
async function guard<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "P2002") {
      throw new ConflictError(`That ${uniqueFields(e)} is already used (it may belong to a deleted record)`);
    }
    if (code === "P2003") throw new ConflictError("A related record does not exist, or is still in use");
    if (code === "P2025") throw new RecordNotFoundError("Record not found");
    throw e;
  }
}

export interface RepoSpec {
  delegate: string;
  include?: Record<string, unknown>;
  decorate?: (row: any) => Record<string, unknown>;
  searchFields: string[];
  /** Filter keys that hold true/false (everything else is matched as text). */
  boolFilters?: string[];
  soft?: boolean;
  /** Where clause for "owned by or reporting to this user". */
  scope?: (userId: string) => Record<string, unknown>;
  orderBy: Record<string, unknown>[];
}

export class PrismaModuleRepo implements ModuleRepo {
  constructor(private readonly db: PrismaClient, private readonly spec: RepoSpec) {}

  private get d() {
    return (this.db as any)[this.spec.delegate];
  }

  private rec(row: any): Rec {
    const base = plain(row);
    // relations were only loaded to build display values
    for (const k of Object.keys(this.spec.include ?? {})) delete (base as any)[k];
    return { ...base, ...(this.spec.decorate?.(row) ?? {}) } as Rec;
  }

  async list(q: ListQuery) {
    const s = this.spec;
    const and: Record<string, unknown>[] = [];
    for (const [k, v] of Object.entries(q.filters)) {
      and.push({ [k]: s.boolFilters?.includes(k) ? v === "true" : v });
    }
    if (q.search && s.searchFields.length) {
      and.push({ OR: s.searchFields.map((f) => ({ [f]: { contains: q.search } })) });
    }
    if (q.scopeUserId && s.scope) and.push(s.scope(q.scopeUserId));
    const where = {
      tenantId: q.tenantId,
      ...(s.soft ? { deletedAt: q.includeDeleted ? { not: null } : null } : {}),
      ...(and.length ? { AND: and } : {}),
    };
    const [rows, total] = await Promise.all([
      this.d.findMany({ where, include: s.include, orderBy: s.orderBy, skip: q.skip, take: q.take }),
      this.d.count({ where }),
    ]);
    return { rows: rows.map((r: any) => this.rec(r)), total: total as number };
  }

  async get(id: string) {
    const row = await this.d.findUnique({ where: { id }, include: this.spec.include });
    return row ? this.rec(row) : null;
  }

  create(tenantId: string, data: Record<string, unknown>) {
    return guard(async () => this.rec(await this.d.create({ data: { ...data, tenantId }, include: this.spec.include })));
  }

  update(id: string, data: Record<string, unknown>) {
    return guard(async () => this.rec(await this.d.update({ where: { id }, data, include: this.spec.include })));
  }

  softDelete(id: string) {
    return guard(async () => void (await this.d.update({ where: { id }, data: { deletedAt: new Date() } })));
  }

  restore(id: string) {
    return guard(async () => void (await this.d.update({ where: { id }, data: { deletedAt: null } })));
  }
}

const empInclude = { employee: { select: { firstName: true, lastName: true } } };

export function hrRepos(db: PrismaClient): Record<string, ModuleRepo> {
  const ownerOrManager = (u: string) => ({ OR: [{ ownerUserId: u }, { managerUserId: u }] });
  const mk = (spec: RepoSpec) => new PrismaModuleRepo(db, spec);
  return {
    "org-units": mk({
      delegate: "orgUnit",
      include: { parent: { select: { name: true } } },
      decorate: (r) => ({ parentName: r.parent?.name ?? null }),
      searchFields: ["code", "name"],
      boolFilters: ["isActive"],
      soft: true,
      orderBy: [{ code: "asc" }],
    }),
    employees: mk({
      delegate: "employee",
      include: {
        orgUnit: { select: { name: true } },
        manager: { select: { firstName: true, lastName: true } },
      },
      decorate: (r) => ({
        fullName: `${r.firstName} ${r.lastName}`,
        orgUnitName: r.orgUnit?.name ?? null,
        managerName: fullName(r.manager),
      }),
      searchFields: ["employeeNo", "firstName", "lastName", "email", "jobTitle"],
      soft: true,
      scope: (u) => ({ OR: [{ userId: u }, { managerUserId: u }] }),
      orderBy: [{ employeeNo: "asc" }],
    }),
    "leave-types": mk({
      delegate: "leaveType",
      searchFields: ["code", "name"],
      boolFilters: ["isPaid", "isActive"],
      soft: true,
      orderBy: [{ code: "asc" }],
    }),
    "leave-requests": mk({
      delegate: "leaveRequest",
      include: { ...empInclude, leaveType: { select: { name: true } } },
      decorate: (r) => ({ employeeName: fullName(r.employee), leaveTypeName: r.leaveType?.name ?? null }),
      searchFields: ["reason"],
      soft: true,
      scope: ownerOrManager,
      orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    }),
    attendance: mk({
      delegate: "attendance",
      include: empInclude,
      decorate: (r) => ({ employeeName: fullName(r.employee) }),
      searchFields: ["note"],
      soft: true,
      scope: ownerOrManager,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
    candidates: mk({
      delegate: "candidate",
      decorate: (r) => ({ fullName: `${r.firstName} ${r.lastName}` }),
      searchFields: ["firstName", "lastName", "email", "position"],
      soft: true,
      orderBy: [{ appliedAt: "desc" }, { createdAt: "desc" }],
    }),
    "payroll-runs": mk({
      delegate: "payrollRun",
      searchFields: ["period"],
      soft: true,
      orderBy: [{ period: "desc" }],
    }),
    payslips: mk({
      delegate: "payslip",
      include: { ...empInclude, run: { select: { period: true } } },
      decorate: (r) => ({ employeeName: fullName(r.employee), runPeriod: r.run?.period ?? null }),
      searchFields: [],
      scope: ownerOrManager,
      orderBy: [{ createdAt: "desc" }],
    }),
  };
}

export class PrismaHrLookups implements LookupSource {
  constructor(private readonly db: PrismaClient) {}

  async options(source: RefSource, tenantId: string): Promise<FieldOption[]> {
    const db = this.db as any;
    if (source === "employees") {
      const rows = await db.employee.findMany({
        where: { tenantId, deletedAt: null, status: { not: "terminated" } },
        select: { id: true, firstName: true, lastName: true, employeeNo: true },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
        take: 2000,
      });
      return rows.map((r: any) => ({ value: r.id, label: `${r.firstName} ${r.lastName} (${r.employeeNo})` }));
    }
    if (source === "orgUnits") {
      const rows = await db.orgUnit.findMany({
        where: { tenantId, deletedAt: null, isActive: true },
        select: { id: true, name: true, code: true },
        orderBy: { name: "asc" },
      });
      return rows.map((r: any) => ({ value: r.id, label: `${r.name} (${r.code})` }));
    }
    const rows = await db.leaveType.findMany({
      where: { tenantId, deletedAt: null, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return rows.map((r: any) => ({ value: r.id, label: r.name }));
  }
}


export function hrExtras(db: PrismaClient) {
  const d = db as any;

  const extras: HrExtras & { syncOwnership(employeeId: string): Promise<void> } = {
    async employeeByUser(tenantId, userId) {
      const row = await d.employee.findFirst({ where: { tenantId, userId, deletedAt: null } });
      return row ? plain(row) : null;
    },

    async leaveUsed(employeeId, leaveTypeId, year, excludeId) {
      const r = await d.leaveRequest.aggregate({
        _sum: { days: true },
        where: {
          employeeId,
          leaveTypeId,
          deletedAt: null,
          status: { in: ["submitted", "approved"] },
          startDate: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) },
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
      });
      return Number(r._sum.days ?? 0);
    },

    async overlappingLeave(employeeId, start, end, excludeId) {
      return d.leaveRequest.count({
        where: {
          employeeId,
          deletedAt: null,
          status: { in: ["draft", "submitted", "approved"] },
          startDate: { lte: end },
          endDate: { gte: start },
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
      });
    },

    async attendanceFor(employeeId, day) {
      const row = await d.attendance.findFirst({ where: { employeeId, date: day, deletedAt: null } });
      return row ? plain(row) : null;
    },

    async generatePayslips(run, deductionPercent, by) {
      const { from, to, workingDays } = periodBounds(String(run.period));
      return db.$transaction(
        async (tx) => {
          const t = tx as any;
          await t.payslip.deleteMany({ where: { runId: run.id } });

          // Everyone on the payroll that month: hired by month end, not left before it began, with a salary.
          const people = await t.employee.findMany({
            where: {
              tenantId: run.tenantId,
              deletedAt: null,
              monthlySalary: { not: null },
              hireDate: { lte: to },
              OR: [{ terminationDate: null }, { terminationDate: { gte: from } }],
            },
          });
          const unpaid = await t.leaveRequest.findMany({
            where: {
              tenantId: run.tenantId,
              deletedAt: null,
              status: "approved",
              leaveType: { isPaid: false },
              startDate: { lte: to },
              endDate: { gte: from },
            },
            select: { employeeId: true, startDate: true, endDate: true },
          });
          const unpaidDays = new Map<string, number>();
          for (const u of unpaid) {
            unpaidDays.set(u.employeeId, (unpaidDays.get(u.employeeId) ?? 0) + weekdaysWithin(u.startDate, u.endDate, from, to));
          }

          let gross = 0, deductions = 0, net = 0;
          const rows = people.map((p: any) => {
            const slip = computePayslip({
              monthlySalary: Number(p.monthlySalary),
              deductionPercent,
              unpaidDays: unpaidDays.get(p.id) ?? 0,
              workingDays,
            });
            gross += slip.gross;
            deductions += slip.deductions;
            net += slip.net;
            return {
              tenantId: run.tenantId,
              runId: run.id,
              employeeId: p.id,
              ownerUserId: p.userId,
              managerUserId: p.managerUserId,
              status: "draft",
              gross: slip.gross,
              deductions: slip.deductions,
              net: slip.net,
              details: { ...slip.details, generatedBy: by },
            };
          });
          if (rows.length) await t.payslip.createMany({ data: rows });
          const r2 = (n: number) => Math.round(n * 100) / 100;
          return { count: rows.length, gross: r2(gross), deductions: r2(deductions), net: r2(net) };
        },
        { timeout: 60_000 },
      );
    },

    async publishPayslips(runId) {
      await d.payslip.updateMany({ where: { runId }, data: { status: "published" } });
    },

    async syncOwnership(employeeId) {
      await db.$transaction(async (tx) => {
        const t = tx as any;
        const e = await t.employee.findUnique({ where: { id: employeeId } });
        if (!e) return;
        // The employee's own records point at their login and their manager's login.
        for (const model of ["leaveRequest", "attendance", "payslip"]) {
          await t[model].updateMany({
            where: { employeeId },
            data: { ownerUserId: e.userId, managerUserId: e.managerUserId },
          });
          // Their reports' records point at this employee's login as manager.
          await t[model].updateMany({
            where: { employee: { managerId: employeeId } },
            data: { managerUserId: e.userId },
          });
        }
        await t.employee.updateMany({ where: { managerId: employeeId }, data: { managerUserId: e.userId } });
      });
    },
  };
  return extras;
}

