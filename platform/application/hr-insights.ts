import type { SessionUser } from "../domain/auth";
import { ymd } from "../domain/hr";
import type { HrLogger } from "./hr-module";
import type { Authorizer } from "./pbac";

export interface Counted {
  label: string;
  count: number;
}

export interface InsightsRepo {
  headcount(tenantId: string): Promise<{ total: number; byOrgUnit: Counted[]; byType: Counted[]; byStatus: Counted[] }>;
  leaveSummary(tenantId: string, year: number): Promise<{ byType: { label: string; days: number; requests: number }[]; byStatus: Counted[] }>;
  attendanceSummary(tenantId: string, from: Date, to: Date): Promise<{ byStatus: Counted[]; averageHours: number; records: number }>;
  payrollTrend(tenantId: string, limit: number): Promise<{ period: string; status: string; employees: number; gross: number; net: number }[]>;
  candidatePipeline(tenantId: string): Promise<Counted[]>;
  /** The employee record linked to a login, with leave balances for the year. */
  me(tenantId: string, userId: string, year: number): Promise<{
    employee: { id: string; name: string; jobTitle: string | null } | null;
    balances: { type: string; allowance: number; used: number; pending: number }[];
    today: { clockIn: Date | null; clockOut: Date | null } | null;
  }>;
  pendingLeave(tenantId: string, managerUserId: string | null): Promise<number>;
  upcomingLeave(tenantId: string, managerUserId: string | null, from: Date, limit: number): Promise<{ employee: string; type: string; start: Date; end: Date; days: number }[]>;
  openCandidates(tenantId: string): Promise<number>;
}

interface Ctx {
  requestId?: string;
  ip?: string;
}

export function createInsights({ repo, authz, log }: { repo: InsightsRepo; authz: Authorizer; log: HrLogger }) {
  const res = (user: SessionUser, type: string, extra: object = {}) => ({ type, tenantId: user.tenantId, ...extra });
  /** True only for unrestricted access (a probe with no owner or manager attributes). */
  const wide = (user: SessionUser, action: string, type: string, ctx: Ctx) => authz.can(user, action, res(user, type), ctx);

  async function run<T>(action: string, user: SessionUser, ctx: Ctx, work: () => Promise<T>): Promise<T> {
    const base = { feature: "hr.insights", action, resourceType: "report", actorId: user.id, tenantId: user.tenantId, requestId: ctx.requestId };
    try {
      const out = await work();
      log.info({ ...base, outcome: "success" }, `hr insights ${action}`);
      return out;
    } catch (e) {
      const denied = (e as Error)?.name === "ForbiddenError";
      (denied ? log.warn : log.error).call(log, { ...base, outcome: denied ? "denied" : "failed", ...(denied ? {} : { err: e }) }, `hr insights ${action} ${denied ? "denied" : "failed"}`);
      throw e;
    }
  }

  return {
    /** Organisation-wide figures. Each section appears only if the caller may see that data. */
    async reports(user: SessionUser, ctx: Ctx = {}) {
      return run("viewAny", user, ctx, async () => {
        await authz.assert(user, "viewAny", res(user, "report"), ctx);
        const t = user.tenantId;
        const now = new Date();
        const year = now.getUTCFullYear();
        const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29));
        const [people, leave, att, hiring, pay] = await Promise.all([
          wide(user, "view", "employee", ctx),
          wide(user, "view", "leave_request", ctx),
          wide(user, "view", "attendance", ctx),
          wide(user, "view", "candidate", ctx),
          wide(user, "view", "payroll_run", ctx),
        ]);
        return {
          generatedAt: now.toISOString(),
          headcount: people ? await repo.headcount(t) : null,
          leave: leave ? { year, ...(await repo.leaveSummary(t, year)) } : null,
          attendance: att ? { from: ymd(from), to: ymd(now), ...(await repo.attendanceSummary(t, from, now)) } : null,
          recruitment: hiring ? await repo.candidatePipeline(t) : null,
          payroll: pay ? await repo.payrollTrend(t, 6) : null,
        };
      });
    },

    /** The signed-in person's home screen: their own numbers, plus what their role oversees. */
    async dashboard(user: SessionUser, ctx: Ctx = {}) {
      return run("view", user, ctx, async () => {
        const t = user.tenantId;
        const now = new Date();
        const today = new Date(`${ymd(now)}T00:00:00.000Z`);

        const [mine, approveAll, approveTeam, peopleWide, hiringWide, leaveWide] = await Promise.all([
          authz.can(user, "view", res(user, "leave_request", { ownerId: user.id }), ctx),
          wide(user, "approve", "leave_request", ctx),
          authz.can(user, "approve", res(user, "leave_request", { managerId: user.id }), ctx),
          wide(user, "view", "employee", ctx),
          wide(user, "view", "candidate", ctx),
          wide(user, "view", "leave_request", ctx),
        ]);

        const me = mine ? await repo.me(t, user.id, now.getUTCFullYear()) : null;
        const approver = approveAll || approveTeam;
        const [pending, upcoming, headcount, openCandidates] = await Promise.all([
          approver ? repo.pendingLeave(t, approveAll ? null : user.id) : null,
          approver || leaveWide ? repo.upcomingLeave(t, approveAll || leaveWide ? null : user.id, today, 6) : null,
          peopleWide ? repo.headcount(t).then((h) => h.total) : null,
          hiringWide ? repo.openCandidates(t) : null,
        ]);
        return {
          employee: me?.employee ?? null,
          balances: me?.balances ?? [],
          today: me?.today ? { clockIn: me.today.clockIn?.toISOString() ?? null, clockOut: me.today.clockOut?.toISOString() ?? null } : null,
          canClock: !!me?.employee,
          pendingApprovals: pending,
          upcomingLeave: upcoming?.map((u) => ({ ...u, start: ymd(u.start), end: ymd(u.end) })) ?? null,
          headcount,
          openCandidates,
        };
      });
    },
  };
}

export type Insights = ReturnType<typeof createInsights>;
