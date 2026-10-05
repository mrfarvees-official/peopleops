/* eslint-disable @typescript-eslint/no-explicit-any */
import type { PrismaClient } from "../../prisma/app/generated/prisma/client";
import type { Counted, InsightsRepo } from "../application/hr-insights";
import {
  CANDIDATE_STAGES,
  EMPLOYEE_STATUSES,
  EMPLOYMENT_TYPES,
  LEAVE_STATUSES,
  ATTENDANCE_STATUSES,
} from "../domain/hr";

const label = (list: readonly { value: string; label: string }[], v: string) => list.find((x) => x.value === v)?.label ?? v;
const num = (v: unknown) => (v == null ? 0 : Number(v));
const r2 = (n: number) => Math.round(n * 100) / 100;

export class PrismaInsightsRepo implements InsightsRepo {
  constructor(private readonly db: PrismaClient) {}

  private get d() {
    return this.db as any;
  }

  private async countBy(model: string, by: string, where: object, names: readonly { value: string; label: string }[]): Promise<Counted[]> {
    const rows = await this.d[model].groupBy({ by: [by], where, _count: { _all: true } });
    return rows
      .map((r: any) => ({ label: label(names, r[by]), count: r._count._all as number }))
      .sort((a: Counted, b: Counted) => b.count - a.count);
  }

  async headcount(tenantId: string) {
    const where = { tenantId, deletedAt: null, status: { not: "terminated" } };
    const [total, byType, byStatus, units, rows] = await Promise.all([
      this.d.employee.count({ where }),
      this.countBy("employee", "employmentType", where, EMPLOYMENT_TYPES),
      this.countBy("employee", "status", { tenantId, deletedAt: null }, EMPLOYEE_STATUSES),
      this.d.orgUnit.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, name: true } }),
      this.d.employee.groupBy({ by: ["orgUnitId"], where, _count: { _all: true } }),
    ]);
    const names = new Map<string | null, string>(units.map((u: any) => [u.id, u.name]));
    const byOrgUnit = rows
      .map((r: any) => ({ label: names.get(r.orgUnitId) ?? "No unit", count: r._count._all as number }))
      .sort((a: Counted, b: Counted) => b.count - a.count);
    return { total, byOrgUnit, byType, byStatus };
  }

  async leaveSummary(tenantId: string, year: number) {
    const range = { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) };
    const where = { tenantId, deletedAt: null, startDate: range };
    const [types, rows, byStatus] = await Promise.all([
      this.d.leaveType.findMany({ where: { tenantId }, select: { id: true, name: true } }),
      this.d.leaveRequest.groupBy({ by: ["leaveTypeId"], where: { ...where, status: "approved" }, _sum: { days: true }, _count: { _all: true } }),
      this.countBy("leaveRequest", "status", where, LEAVE_STATUSES),
    ]);
    const names = new Map<string, string>(types.map((t: any) => [t.id, t.name]));
    return {
      byType: rows
        .map((r: any) => ({ label: names.get(r.leaveTypeId) ?? "Other", days: num(r._sum.days), requests: r._count._all as number }))
        .sort((a: any, b: any) => b.days - a.days),
      byStatus,
    };
  }

  async attendanceSummary(tenantId: string, from: Date, to: Date) {
    const where = { tenantId, deletedAt: null, date: { gte: from, lte: to } };
    const [byStatus, avg, records] = await Promise.all([
      this.countBy("attendance", "status", where, ATTENDANCE_STATUSES),
      this.d.attendance.aggregate({ where: { ...where, hours: { not: null } }, _avg: { hours: true } }),
      this.d.attendance.count({ where }),
    ]);
    return { byStatus, averageHours: r2(num(avg._avg.hours)), records };
  }

  async payrollTrend(tenantId: string, limit: number) {
    const rows = await this.d.payrollRun.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { period: "desc" },
      take: limit,
    });
    return rows
      .map((r: any) => ({ period: r.period, status: r.status, employees: r.employeeCount, gross: num(r.totalGross), net: num(r.totalNet) }))
      .reverse();
  }

  async candidatePipeline(tenantId: string) {
    const rows = await this.d.candidate.groupBy({ by: ["stage"], where: { tenantId, deletedAt: null }, _count: { _all: true } });
    const by = new Map<string, number>(rows.map((r: any) => [r.stage, r._count._all]));
    return CANDIDATE_STAGES.map((s) => ({ label: s.label, count: by.get(s.value) ?? 0 }));
  }

  async me(tenantId: string, userId: string, year: number) {
    const emp = await this.d.employee.findFirst({ where: { tenantId, userId, deletedAt: null } });
    if (!emp) return { employee: null, balances: [], today: null };
    const range = { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) };
    const [types, used, att] = await Promise.all([
      this.d.leaveType.findMany({ where: { tenantId, deletedAt: null, isActive: true }, orderBy: { name: "asc" } }),
      this.d.leaveRequest.groupBy({
        by: ["leaveTypeId", "status"],
        where: { employeeId: emp.id, deletedAt: null, status: { in: ["submitted", "approved"] }, startDate: range },
        _sum: { days: true },
      }),
      this.d.attendance.findFirst({
        where: { employeeId: emp.id, deletedAt: null, date: new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`) },
      }),
    ]);
    const sum = (typeId: string, status: string) =>
      num(used.find((u: any) => u.leaveTypeId === typeId && u.status === status)?._sum.days);
    return {
      employee: { id: emp.id as string, name: `${emp.firstName} ${emp.lastName}`, jobTitle: emp.jobTitle as string | null },
      balances: types.map((t: any) => ({ type: t.name as string, allowance: num(t.daysPerYear), used: sum(t.id, "approved"), pending: sum(t.id, "submitted") })),
      today: att ? { clockIn: att.clockIn as Date | null, clockOut: att.clockOut as Date | null } : null,
    };
  }

  pendingLeave(tenantId: string, managerUserId: string | null) {
    return this.d.leaveRequest.count({
      where: { tenantId, deletedAt: null, status: "submitted", ...(managerUserId ? { managerUserId } : {}) },
    });
  }

  async upcomingLeave(tenantId: string, managerUserId: string | null, from: Date, limit: number) {
    const rows = await this.d.leaveRequest.findMany({
      where: { tenantId, deletedAt: null, status: "approved", endDate: { gte: from }, ...(managerUserId ? { managerUserId } : {}) },
      include: { employee: { select: { firstName: true, lastName: true } }, leaveType: { select: { name: true } } },
      orderBy: { startDate: "asc" },
      take: limit,
    });
    return rows.map((r: any) => ({
      employee: `${r.employee.firstName} ${r.employee.lastName}`,
      type: r.leaveType.name as string,
      start: r.startDate as Date,
      end: r.endDate as Date,
      days: num(r.days),
    }));
  }

  openCandidates(tenantId: string) {
    return this.d.candidate.count({ where: { tenantId, deletedAt: null, stage: { notIn: ["hired", "rejected"] } } });
  }
}
