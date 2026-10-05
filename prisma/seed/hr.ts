import type { PrismaClient } from "../app/generated/prisma/client";
import {
  computePayslip,
  countWeekdays,
  periodBounds,
  weekdaysWithin,
} from "../../platform/domain/hr";
import {
  DECLINE_REASONS,
  FIRST_NAMES,
  GOOD_NOTES,
  LAST_NAMES,
  LEAVE_TYPES,
  LEGACY,
  OPEN_POSITIONS,
  ORG_UNITS,
  RECENT,
  REJECT_NOTES,
  SOURCES,
  STREETS,
  SUBURBS,
  type EmploymentType,
} from "./data/hr";

/**
 * Demo HR data for the "demo" company: two years of history.
 *
 *  - 38 employees. Nine long-serving staff came before the candidate records
 *    begin; the other 29 were each hired through a candidate record in the
 *    last 24 months (four of them have since left, one is on maternity leave).
 *  - Applicants who were not hired, plus the pipeline for current openings.
 *  - Leave for the whole period within each person's allowance, 90 days of
 *    attendance, and 24 monthly payroll runs (published) with the current
 *    month waiting as a draft.
 *
 * Everything is deterministic (fixed random seed, dates relative to today), so
 * the same people appear on every machine. It only builds when the company has
 * no HR data, or only the earlier E000-style demo set. Set SEED_RESET_HR=1 to
 * rebuild on purpose.
 */

const DAY = 86_400_000;
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
const isWeekday = (d: Date) => d.getUTCDay() !== 0 && d.getUTCDay() !== 6;
const nextWeekday = (d: Date) => {
  let x = d;
  while (!isWeekday(x)) x = addDays(x, 1);
  return x;
};
const prevWeekday = (d: Date) => {
  let x = d;
  while (!isWeekday(x)) x = addDays(x, -1);
  return x;
};
const mondayOnOrAfter = (d: Date) => addDays(d, (8 - d.getUTCDay()) % 7);
const maxD = (a: Date, b: Date) => (a > b ? a : b);
const minD = (a: Date, b: Date) => (a < b ? a : b);
const round = (n: number, to: number) => Math.round(n / to) * to;
const r2 = (n: number) => Math.round(n * 100) / 100;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Emp {
  no: string;
  first: string;
  last: string;
  title: string;
  unit: string;
  manager: string | null;
  type: EmploymentType;
  salary: number;
  role?: string;
  hired: Date;
  left: Date | null;
  onLeave: boolean;
  legacy: boolean;
}

export async function seedHr(
  prisma: PrismaClient,
  tenantId: string,
  today = new Date(),
) {
  const existing = await prisma.employee.findMany({
    where: { tenantId },
    select: { employeeNo: true },
  });
  const reset = process.env.SEED_RESET_HR === "1";
  const earlierDemo = existing.every((e) => /^E\d{3}$/.test(e.employeeNo));
  if (!reset && existing.length > 0 && !earlierDemo) {
    console.log(
      "hr seed: company already has HR data, leaving it alone (SEED_RESET_HR=1 rebuilds it)",
    );
    return;
  }

  await prisma.$transaction(
    async (tx) => build(tx as unknown as PrismaClient, tenantId, today),
    { timeout: 300_000, maxWait: 30_000 },
  );
}

async function build(prisma: PrismaClient, tenantId: string, today: Date) {
  const rand = mulberry32(20261006);
  const int = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
  const between = (a: number, b: number) => a + rand() * (b - a);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
  const chance = (p: number) => rand() < p;
  const weighted = (pairs: [string, number][]) => {
    let r = rand() * pairs.reduce((n, [, w]) => n + w, 0);
    for (const [v, w] of pairs) if ((r -= w) <= 0) return v;
    return pairs[0][0];
  };
  const base = day(iso(today));

  // ───────────────────────────────────────────── wipe the earlier demo HR data
  await prisma.payslip.deleteMany({ where: { tenantId } });
  await prisma.payrollRun.deleteMany({ where: { tenantId } });
  await prisma.attendance.deleteMany({ where: { tenantId } });
  await prisma.leaveRequest.deleteMany({ where: { tenantId } });
  await prisma.candidate.deleteMany({ where: { tenantId } });
  await prisma.employee.updateMany({
    where: { tenantId },
    data: { managerId: null },
  });
  await prisma.employee.deleteMany({ where: { tenantId } });
  await prisma.orgUnit.updateMany({
    where: { tenantId },
    data: { parentId: null },
  });
  await prisma.orgUnit.deleteMany({ where: { tenantId } });
  await prisma.leaveType.deleteMany({ where: { tenantId } });

  // ─────────────────────────────────────────────────── org units, leave types
  const unitId = new Map<string, string>();
  for (const u of ORG_UNITS) {
    const row = await prisma.orgUnit.create({
      data: {
        tenantId,
        code: u.code,
        name: u.name,
        parentId: u.parent ? unitId.get(u.parent)! : null,
      },
    });
    unitId.set(u.code, row.id);
  }
  const typeId = new Map<string, string>();
  const allowance = new Map<string, number>();
  for (const t of LEAVE_TYPES) {
    const row = await prisma.leaveType.create({ data: { tenantId, ...t } });
    typeId.set(t.code, row.id);
    allowance.set(t.code, t.daysPerYear);
  }

  // ─────────────────────────────────────────────────────────────── employees
  const staff: Emp[] = [
    ...LEGACY.map((p) => ({
      ...p,
      hired: day(p.hired),
      left: null,
      onLeave: false,
      legacy: true,
      no: "",
    })),
    ...RECENT.map((p) => ({
      ...p,
      hired: minD(mondayOnOrAfter(addDays(base, -p.ago)), base),
      left: p.left ? prevWeekday(addDays(base, -p.left)) : null,
      onLeave: !!p.onLeave,
      legacy: false,
      no: "",
    })),
  ];
  staff.sort((a, b) => a.hired.getTime() - b.hired.getTime());
  staff.forEach((e, i) => (e.no = `EMP-${String(i + 1).padStart(4, "0")}`));
  const byName = new Map(staff.map((e) => [`${e.first} ${e.last}`, e]));
  const taken = new Set(staff.map((e) => `${e.first} ${e.last}`));

  const users = await prisma.user.findMany({
    where: { tenantId },
    include: { roles: { include: { role: true } } },
  });
  const userByRole = new Map(
    users.flatMap((u) => u.roles.map((r) => [r.role.code, u.id] as const)),
  );
  const hrAdminUser = userByRole.get("hr_admin") ?? null;

  const empId = new Map<string, string>();
  const empUser = new Map<string, string | null>();
  for (const e of staff) {
    const userId = e.role ? (userByRole.get(e.role) ?? null) : null;
    const doy = int(1, 366);
    const nic = `${int(1976, 2003)}${String(chance(0.45) ? doy + 500 : doy).padStart(3, "0")}${String(int(0, 9999)).padStart(4, "0")}${int(0, 9)}`;
    const row = await prisma.employee.create({
      data: {
        tenantId,
        userId,
        employeeNo: e.no,
        firstName: e.first,
        lastName: e.last,
        email:
          `${e.first}.${e.last}`.toLowerCase().replace(/\s/g, "") + "@demo.com",
        phone: `+94 ${pick(["70", "71", "72", "74", "75", "76", "77", "78"])} ${int(100, 999)} ${int(1000, 9999)}`,
        jobTitle: e.title,
        orgUnitId: unitId.get(e.unit)!,
        employmentType: e.type,
        status: e.left ? "terminated" : e.onLeave ? "on_leave" : "active",
        hireDate: e.hired,
        terminationDate: e.left,
        monthlySalary: e.salary,
        nationalId: nic,
        address: `${int(1, 240)}${chance(0.3) ? "/" + pick(["A", "B", "1", "2"]) : ""}, ${pick(STREETS)}, ${pick(SUBURBS)}`,
      },
    });
    empId.set(e.no, row.id);
    empUser.set(e.no, userId);
  }
  for (const e of staff) {
    if (!e.manager) continue;
    const m = byName.get(e.manager);
    if (!m) throw new Error(`hr seed: unknown manager ${e.manager}`);
    await prisma.employee.update({
      where: { id: empId.get(e.no)! },
      data: {
        managerId: empId.get(m.no)!,
        managerUserId: empUser.get(m.no) ?? null,
      },
    });
  }
  const managerUser = (e: Emp) =>
    e.manager ? (empUser.get(byName.get(e.manager)!.no) ?? null) : null;
  const approverOf = (e: Emp) => managerUser(e) ?? hrAdminUser;

  // ─────────────────────────────────────────────────────────────────── leave
  const windowStart = addDays(base, -730);
  const windowEnd = addDays(base, 60);
  type Leave = {
    emp: Emp;
    type: string;
    start: Date;
    end: Date;
    days: number;
    status: string;
    reason: string;
    createdAt: Date;
    decidedAt: Date | null;
    decidedBy: string | null;
    note: string | null;
  };
  const leaves: Leave[] = [];
  const blocks = new Map<string, { s: Date; e: Date; approved: boolean }[]>();
  const used = new Map<string, number>();
  const REASONS: Record<string, string[]> = {
    ANNUAL: [
      "Family trip",
      "Holiday in Nuwara Eliya",
      "Visiting family",
      "Annual vacation",
      "Pilgrimage",
      "Travel abroad",
      "Beach holiday in Mirissa",
    ],
    CASUAL: [
      "Personal errands",
      "Bank and legal work",
      "Family function",
      "School admission matter",
      "Vehicle service",
      "House viewing",
    ],
    SICK: [
      "Fever",
      "Flu",
      "Migraine",
      "Stomach infection",
      "Dental treatment",
      "Back pain",
      "Medical check-up",
    ],
    NOPAY: ["Personal matters", "Extended family visit"],
    PATERNITY: ["Birth of child"],
    MATERNITY: ["Maternity leave"],
  };
  const endAfterWeekdays = (start: Date, n: number) => {
    let d = start;
    let c = 1;
    while (c < n) {
      d = addDays(d, 1);
      if (isWeekday(d)) c++;
    }
    return d;
  };
  const free = (e: Emp, s: Date, t: Date) =>
    !(blocks.get(e.no) ?? []).some((b) => s <= b.e && t >= b.s);
  const left = (e: Emp) => e.left ?? windowEnd;

  function statusFor(start: Date, end: Date, forced?: string) {
    if (forced) return forced;
    if (end < base)
      return chance(0.04)
        ? "rejected"
        : chance(0.04)
          ? "cancelled"
          : "approved";
    if (start <= base) return "approved";
    const soon = start <= addDays(base, 45);
    const r = rand();
    return soon
      ? r < 0.55
        ? "approved"
        : r < 0.85
          ? "submitted"
          : "draft"
      : r < 0.6
        ? "submitted"
        : "draft";
  }

  function add(
    e: Emp,
    type: string,
    start: Date,
    len: number,
    forced?: string,
    reason?: string,
  ): boolean {
    const end = endAfterWeekdays(start, len);
    // Only the start is bounded by the window: a long leave (maternity) may run past it.
    if (
      start < windowStart ||
      start > windowEnd ||
      start < e.hired ||
      (e.left && end > e.left)
    )
      return false;
    if (!free(e, start, end)) return false;
    const year = start.getUTCFullYear();
    const key = `${e.no}|${type}|${year}`;
    const cap = allowance.get(type) ?? 0;
    const status = statusFor(start, end, forced);
    const counts = status !== "rejected" && status !== "cancelled";
    if (counts && cap > 0 && (used.get(key) ?? 0) + len > cap) return false;

    const sick = type === "SICK";
    const decided = status === "approved" || status === "rejected";
    let createdAt =
      status === "draft" || status === "submitted" || start > base
        ? addDays(base, -int(1, 9))
        : sick
          ? addDays(start, int(0, 1))
          : addDays(start, -int(4, 25));
    createdAt = minD(maxD(createdAt, e.hired), base);
    const decidedAt = decided
      ? minD(addDays(createdAt, int(0, 3)), base)
      : null;

    leaves.push({
      emp: e,
      type,
      start,
      end,
      days: len,
      status,
      reason: reason ?? pick(REASONS[type] ?? ["Personal"]),
      createdAt,
      decidedAt,
      decidedBy: decided ? approverOf(e) : null,
      note:
        status === "rejected"
          ? pick(DECLINE_REASONS)
          : status === "cancelled"
            ? "Plans changed."
            : null,
    });
    if (counts) {
      used.set(key, (used.get(key) ?? 0) + len);
      blocks.set(e.no, [
        ...(blocks.get(e.no) ?? []),
        { s: start, e: end, approved: status === "approved" },
      ]);
    }
    return true;
  }

  // Life events first, so everyone else's leave works around them.
  const kavindi = byName.get("Kavindi Hettiarachchi")!;
  add(
    kavindi,
    "MATERNITY",
    mondayOnOrAfter(addDays(base, -42)),
    84,
    "approved",
  );
  add(
    byName.get("Pasindu Ratnayake")!,
    "PATERNITY",
    nextWeekday(addDays(base, -300)),
    3,
    "approved",
  );
  add(
    byName.get("Ishara Wijesinghe")!,
    "NOPAY",
    nextWeekday(addDays(base, -150)),
    2,
    "approved",
  );
  add(
    byName.get("Nuwan Seneviratne")!,
    "NOPAY",
    nextWeekday(addDays(base, -90)),
    1,
    "approved",
  );
  add(
    byName.get("Janith Rajapaksa")!,
    "NOPAY",
    nextWeekday(addDays(base, -210)),
    2,
    "approved",
  );

  // A few open requests that managers can act on straight away (they drive the demo screens).
  const demoOpen = new Set(["Kasun Bandara", "Sanduni Perera", "Mahesh Silva"]);
  const weekdayFromNow = (n: number) => nextWeekday(addDays(base, n));
  add(
    byName.get("Kasun Bandara")!,
    "ANNUAL",
    weekdayFromNow(7),
    3,
    "submitted",
    "Family trip",
  );
  add(
    byName.get("Kasun Bandara")!,
    "CASUAL",
    weekdayFromNow(21),
    1,
    "draft",
    "Bank and legal work",
  );
  add(
    byName.get("Sanduni Perera")!,
    "CASUAL",
    weekdayFromNow(10),
    1,
    "submitted",
    "House viewing",
  );
  add(
    byName.get("Mahesh Silva")!,
    "ANNUAL",
    weekdayFromNow(14),
    5,
    "submitted",
    "Annual vacation",
  );

  // Everyone else, year by year, scaled to the time they were employed.
  for (const e of staff) {
    const from = maxD(e.hired, windowStart);
    const to = minD(left(e), windowEnd);
    if (to <= from) continue;
    for (let y = from.getUTCFullYear(); y <= to.getUTCFullYear(); y++) {
      const s = maxD(from, day(`${y}-01-01`));
      const t = minD(to, day(`${y}-12-31`));
      if (t <= s) continue;
      const share = Math.max(
        0.25,
        Math.min(1, (t.getTime() - s.getTime()) / (365 * DAY)),
      );
      const place = (type: string, len: number) => {
        for (let tries = 0; tries < 8; tries++) {
          const span = Math.max(
            0,
            Math.floor((t.getTime() - s.getTime()) / DAY) -
              Math.ceil(len * 1.6) -
              2,
          );
          let start = nextWeekday(addDays(s, int(0, span)));
          // people on probation take no annual leave; the demo logins keep their prepared future requests
          if (type === "ANNUAL" && start < addDays(e.hired, 120)) continue;
          if (demoOpen.has(`${e.first} ${e.last}`) && start > base)
            start = prevWeekday(addDays(base, -int(3, 40)));
          if (type === "SICK" && start > base) continue;
          if (add(e, type, start, len)) return true;
        }
        return false;
      };

      let annual = Math.round(14 * share * between(0.45, 0.9));
      while (annual > 0) {
        const len = Math.min(annual, int(1, 5));
        if (!place("ANNUAL", len)) break;
        annual -= len;
      }
      for (let n = int(1, Math.max(1, Math.round(4 * share))); n > 0; n--)
        place("CASUAL", 1);
      for (let n = int(0, Math.max(1, Math.round(3 * share))); n > 0; n--)
        place("SICK", chance(0.7) ? 1 : int(2, 3));
    }
  }

  const leaveRows = leaves.map((l) => ({
    tenantId,
    employeeId: empId.get(l.emp.no)!,
    ownerUserId: empUser.get(l.emp.no) ?? null,
    managerUserId: managerUser(l.emp),
    leaveTypeId: typeId.get(l.type)!,
    startDate: l.start,
    endDate: l.end,
    days: l.days,
    reason: l.reason,
    status: l.status,
    decidedBy: l.decidedBy,
    decidedAt: l.decidedAt,
    decisionNote: l.note,
    createdAt: l.createdAt,
  }));
  for (let i = 0; i < leaveRows.length; i += 500)
    await prisma.leaveRequest.createMany({ data: leaveRows.slice(i, i + 500) });

  // ───────────────────────────────────────────────────────────── attendance
  // The last 90 days up to yesterday; nobody has clocked in today, so clock in works live.
  const remoteRate: Record<string, number> = {
    "ENG-BE": 0.2,
    "ENG-FE": 0.2,
    "ENG-QA": 0.15,
    "ENG-OPS": 0.2,
    ENG: 0.15,
    PROD: 0.15,
    OPS: 0,
    CS: 0.05,
  };
  const local = (d: Date, minutes: number) =>
    new Date(d.getTime() + (minutes - 330) * 60_000); // Asia/Colombo is UTC+5:30
  const attendance: Record<string, unknown>[] = [];
  for (let back = 1; back <= 90; back++) {
    const d = addDays(base, -back);
    if (!isWeekday(d)) continue;
    for (const e of staff) {
      if (d < e.hired || (e.left && d > e.left)) continue;
      if (
        (blocks.get(e.no) ?? []).some((b) => b.approved && d >= b.s && d <= b.e)
      )
        continue;
      const roll = rand();
      const partTime = e.type === "part_time";
      let status = "present";
      let inMin = Math.round(between(8 * 60 + 25, 9 * 60 + 10));
      let outMin = Math.round(between(17 * 60 + 5, 18 * 60 + 5));
      let note: string | null = null;
      if (roll < 0.012) status = "absent";
      else if (roll < 0.028) {
        status = "half_day";
        outMin = 13 * 60 + int(0, 30);
        note = "Half day";
      } else if (roll < 0.075) {
        status = "late";
        inMin = int(9 * 60 + 35, 10 * 60 + 25);
        note = chance(0.5) ? "Traffic" : null;
      } else if (chance(remoteRate[e.unit] ?? 0.08)) status = "remote";
      if (partTime && status !== "absent") {
        inMin = 9 * 60 + int(0, 20);
        outMin = 13 * 60 + int(0, 25);
      }
      attendance.push({
        tenantId,
        employeeId: empId.get(e.no)!,
        ownerUserId: empUser.get(e.no) ?? null,
        managerUserId: managerUser(e),
        date: d,
        clockIn: status === "absent" ? null : local(d, inMin),
        clockOut: status === "absent" ? null : local(d, outMin),
        hours: status === "absent" ? null : r2((outMin - inMin) / 60),
        status,
        note: status === "absent" ? "Not reported" : note,
        createdAt: local(d, 19 * 60),
      });
    }
  }
  for (let i = 0; i < attendance.length; i += 1000) {
    await prisma.attendance.createMany({
      data: attendance.slice(i, i + 1000) as never,
    });
  }

  // ───────────────────────────────────────────────────────────── candidates
  const emailSeen = new Set<string>();
  const personal = (first: string, last: string) => {
    for (let n = 0; ; n++) {
      const e =
        `${first}.${last}${n ? int(10, 99) : ""}@${pick(["gmail.com", "gmail.com", "yahoo.com", "outlook.com"])}`
          .toLowerCase()
          .replace(/\s/g, "");
      if (!emailSeen.has(e)) {
        emailSeen.add(e);
        return e;
      }
    }
  };
  const freshName = () => {
    for (;;) {
      const first = pick(FIRST_NAMES);
      const last = pick(LAST_NAMES);
      if (!taken.has(`${first} ${last}`)) {
        taken.add(`${first} ${last}`);
        return { first, last };
      }
    }
  };
  const phone = () =>
    `+94 ${pick(["70", "71", "72", "74", "75", "76", "77", "78"])} ${int(100, 999)} ${int(1000, 9999)}`;

  type Cand = {
    first: string;
    last: string;
    position: string;
    stage: string;
    source: string;
    expected: number;
    applied: Date;
    notes: string;
  };
  const cands: Cand[] = [];

  // Every recent hire has a candidate record (and the applicants they beat).
  for (const e of staff.filter((x) => !x.legacy)) {
    cands.push({
      first: e.first,
      last: e.last,
      position: e.title,
      stage: "hired",
      source: weighted(SOURCES),
      expected: round(e.salary * between(0.97, 1.1), 5000),
      applied: addDays(e.hired, -int(35, 70)),
      notes: `Hired as ${e.title} (${e.no}). ${pick(GOOD_NOTES)}`,
    });
    for (let n = 3 + (cands.length % 3); n > 0; n--) {
      const p = freshName();
      cands.push({
        first: p.first,
        last: p.last,
        position: e.title,
        stage: "rejected",
        source: weighted(SOURCES),
        expected: round(e.salary * between(0.9, 1.35), 5000),
        applied: addDays(e.hired, -int(30, 95)),
        notes: pick(REJECT_NOTES),
      });
    }
  }
  // Current openings: applicants of the last six weeks, further along the older they are.
  for (const o of OPEN_POSITIONS) {
    for (let n = int(3, 5); n > 0; n--) {
      const p = freshName();
      const age = int(1, 42);
      const stage =
        age < 9
          ? "applied"
          : age < 22
            ? pick(["screening", "screening", "applied"])
            : age < 34
              ? pick(["interview", "interview", "screening"])
              : pick(["offer", "interview", "rejected"]);
      cands.push({
        first: p.first,
        last: p.last,
        position: o.title,
        stage,
        source: weighted(SOURCES),
        expected: round(o.salary * between(0.92, 1.25), 5000),
        applied: addDays(base, -age),
        notes:
          stage === "rejected"
            ? pick(REJECT_NOTES)
            : stage === "offer"
              ? "Offer sent, awaiting reply."
              : stage === "interview"
                ? "Technical interview scheduled."
                : "",
      });
    }
  }
  await prisma.candidate.createMany({
    data: cands.map((c) => ({
      tenantId,
      firstName: c.first,
      lastName: c.last,
      email: personal(c.first, c.last),
      phone: phone(),
      position: c.position,
      stage: c.stage,
      source: c.source,
      expectedSalary: c.expected,
      appliedAt: minD(c.applied, base),
      notes: c.notes || null,
      createdAt: new Date(minD(c.applied, base).getTime() + 10 * 3_600_000),
    })),
  });

  // ──────────────────────────────────────────────────────────────── payroll
  // Annual increment of 8% each April for anyone who had been there 90 days.
  const salaryAt = (e: Emp, from: Date, to: Date) => {
    let s = e.salary;
    const cap = minD(base, e.left ?? base);
    for (let y = from.getUTCFullYear(); y <= base.getUTCFullYear(); y++) {
      const april = day(`${y}-04-01`);
      if (april > to && april <= cap && e.hired <= addDays(april, -90))
        s /= 1.08;
    }
    return round(s, 500);
  };

  const approvedNoPay = leaves.filter(
    (l) => l.type === "NOPAY" && l.status === "approved",
  );
  const first = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - 24, 1),
  );
  let runs = 0;
  let slipsTotal = 0;
  for (let m = 0; m < 24; m++) {
    const monthStart = new Date(
      Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + m, 1),
    );
    const period = iso(monthStart).slice(0, 7);
    const { from, to, workingDays } = periodBounds(period);
    let gross = 0,
      deductions = 0,
      net = 0;
    const slips: Record<string, unknown>[] = [];
    for (const e of staff) {
      const a = maxD(e.hired, from);
      const b = minD(e.left ?? to, to);
      if (b < a) continue;
      const employed = countWeekdays(a, b);
      if (employed === 0) continue;
      const basis = r2(
        salaryAt(e, from, to) * Math.min(1, employed / workingDays),
      );
      const unpaid = approvedNoPay
        .filter((l) => l.emp === e)
        .reduce(
          (n, l) =>
            n + weekdaysWithin(l.start, l.end, maxD(from, a), minD(to, b)),
          0,
        );
      const slip = computePayslip({
        monthlySalary: basis,
        deductionPercent: 10,
        unpaidDays: unpaid,
        workingDays: employed,
      });
      gross += slip.gross;
      deductions += slip.deductions;
      net += slip.net;
      slips.push({
        tenantId,
        employeeId: empId.get(e.no)!,
        ownerUserId: empUser.get(e.no) ?? null,
        managerUserId: managerUser(e),
        status: "published",
        gross: slip.gross,
        deductions: slip.deductions,
        net: slip.net,
        details: {
          ...slip.details,
          employedWorkingDays: employed,
          monthWorkingDays: workingDays,
        },
        createdAt: addDays(to, 2),
      });
    }
    const run = await prisma.payrollRun.create({
      data: {
        tenantId,
        period,
        status: "published",
        employeeCount: slips.length,
        totalGross: r2(gross),
        totalDeductions: r2(deductions),
        totalNet: r2(net),
        lockedAt: addDays(to, 2),
        publishedAt: addDays(to, 3),
        createdAt: addDays(to, 1),
      },
    });
    await prisma.payslip.createMany({
      data: slips.map((s) => ({ ...s, runId: run.id })) as never,
    });
    runs++;
    slipsTotal += slips.length;
  }
  await prisma.payrollRun.create({
    data: { tenantId, period: iso(base).slice(0, 7), status: "draft" },
  });

  console.log(
    `hr seed: ${staff.length} employees (${staff.filter((e) => !e.legacy).length} hired from candidates), ${cands.length} candidates, ` +
      `${leaves.length} leave requests, ${attendance.length} attendance records, ${runs + 1} payroll runs, ${slipsTotal} payslips`,
  );
}
