import {
  ATTENDANCE_STATUSES,
  CANDIDATE_STAGES,
  ConflictError,
  EMPLOYEE_STATUSES,
  EMPLOYMENT_TYPES,
  InvalidTransitionError,
  LEAVE_STATUSES,
  PAYROLL_STATUSES,
  RecordNotFoundError,
  ValidationError,
  countWeekdays,
  hoursBetween,
  isPeriod,
  ymd,
  type FieldDef,
} from "../domain/hr";
import type { ActionDef, ModuleConfig, Rec } from "./hr-module";

const opts = <T extends readonly { value: string; label: string }[]>(o: T) => o.map((x) => ({ ...x }));
const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const today = (d: Date) => new Date(`${ymd(d)}T00:00:00.000Z`);

/** Reads a field value from the changes being saved, falling back to the stored record. */
const pick = (data: Record<string, unknown>, existing: Rec | undefined, key: string) =>
  key in data ? data[key] : existing?.[key];

// ───────────────────────────────────────────────────────────────── org units

const orgUnits: ModuleConfig = {
  key: "org-units",
  label: "Org units",
  singular: "Org unit",
  resource: "org_unit",
  soft: true,
  scoped: false,
  fields: [
    { key: "code", label: "Code", type: "text", required: true, max: 32 },
    { key: "name", label: "Name", type: "text", required: true, max: 128 },
    { key: "parentId", label: "Parent unit", type: "ref", ref: "orgUnits" },
    { key: "isActive", label: "Active", type: "bool" },
    { key: "parentName", label: "Parent unit", type: "text", display: true },
  ],
  columns: ["code", "name", "parentName", "isActive"],
  searchable: ["code", "name"],
  filters: ["isActive"],
  attrs: () => ({}),
  async prepare({ deps, tenantId }, data, existing) {
    if (data.parentId) {
      let cursor: string | null = String(data.parentId);
      for (let depth = 0; cursor && depth < 25; depth++) {
        if (existing && cursor === existing.id) throw new ValidationError("An org unit cannot sit under itself", [{ field: "parentId", message: "creates a loop" }]);
        const parent: Rec | null = await deps.repos["org-units"].get(cursor);
        if (!parent || parent.tenantId !== tenantId || parent.deletedAt) {
          throw new ValidationError("Unknown parent unit", [{ field: "parentId", message: "not found" }]);
        }
        cursor = (parent.parentId as string | null) ?? null;
      }
    }
    return existing ? data : { isActive: true, ...data };
  },
};

// ───────────────────────────────────────────────────────────────── employees

const employeeFields: FieldDef[] = [
  { key: "employeeNo", label: "Employee no.", type: "text", required: true, max: 32 },
  { key: "firstName", label: "First name", type: "text", required: true, max: 128 },
  { key: "lastName", label: "Last name", type: "text", required: true, max: 128 },
  { key: "email", label: "Work email", type: "email", required: true },
  { key: "phone", label: "Phone", type: "phone" },
  { key: "jobTitle", label: "Job title", type: "text", max: 128 },
  { key: "orgUnitId", label: "Org unit", type: "ref", ref: "orgUnits" },
  { key: "managerId", label: "Manager", type: "ref", ref: "employees" },
  { key: "employmentType", label: "Employment type", type: "select", required: true, options: opts(EMPLOYMENT_TYPES) },
  { key: "status", label: "Status", type: "select", required: true, options: opts(EMPLOYEE_STATUSES) },
  { key: "hireDate", label: "Hire date", type: "date", required: true },
  { key: "terminationDate", label: "Termination date", type: "date" },
  { key: "monthlySalary", label: "Monthly salary", type: "money", sensitive: true },
  { key: "nationalId", label: "National ID", type: "text", max: 32, sensitive: true },
  { key: "address", label: "Address", type: "text", max: 255 },
  { key: "userId", label: "Login", type: "text", readOnly: true },
  { key: "fullName", label: "Name", type: "text", display: true },
  { key: "orgUnitName", label: "Org unit", type: "text", display: true },
  { key: "managerName", label: "Manager", type: "text", display: true },
];

const employees: ModuleConfig = {
  key: "employees",
  label: "Employees",
  singular: "Employee",
  resource: "employee",
  soft: true,
  scoped: true,
  fields: employeeFields,
  columns: ["employeeNo", "fullName", "jobTitle", "orgUnitName", "managerName", "status"],
  searchable: ["employeeNo", "firstName", "lastName", "email", "jobTitle"],
  filters: ["orgUnitId", "status", "employmentType", "managerId"],
  attrs: (r) => ({ ownerId: r.userId as string | null, managerId: r.managerUserId as string | null, status: r.status as string }),
  async prepare({ deps, tenantId }, data, existing) {
    const out = { ...data };

    if ("orgUnitId" in data && data.orgUnitId) {
      const unit = await deps.repos["org-units"].get(String(data.orgUnitId));
      if (!unit || unit.tenantId !== tenantId || unit.deletedAt) {
        throw new ValidationError("Unknown org unit", [{ field: "orgUnitId", message: "not found" }]);
      }
    }
    if ("managerId" in data) {
      if (data.managerId) {
        if (existing && data.managerId === existing.id) {
          throw new ValidationError("An employee cannot be their own manager", [{ field: "managerId", message: "not allowed" }]);
        }
        const manager = await deps.repos.employees.get(String(data.managerId));
        if (!manager || manager.tenantId !== tenantId || manager.deletedAt) {
          throw new ValidationError("Unknown manager", [{ field: "managerId", message: "not found" }]);
        }
        out.managerUserId = (manager.userId as string | null) ?? null;
      } else {
        out.managerUserId = null;
      }
    }

    const hired = pick(data, existing, "hireDate") as Date | undefined;
    const left = pick(data, existing, "terminationDate") as Date | null | undefined;
    if (hired && left && left < hired) {
      throw new ValidationError("The termination date is before the hire date", [{ field: "terminationDate", message: "must not be before the hire date" }]);
    }
    if (pick(data, existing, "status") === "terminated" && !left) {
      out.terminationDate = deps.now();
    }
    return out;
  },
  // Policies compare the owner and manager login ids, so records that carry
  // copies of them must follow when the employee's manager or login changes.
  async after({ deps }, rec, before) {
    if (!before || before.managerId !== rec.managerId || before.managerUserId !== rec.managerUserId || before.userId !== rec.userId) {
      await deps.syncOwnership(rec.id);
    }
  },
};

// ───────────────────────────────────────────────────────────────── leave types

const leaveTypes: ModuleConfig = {
  key: "leave-types",
  label: "Leave types",
  singular: "Leave type",
  resource: "leave_type",
  soft: true,
  scoped: false,
  fields: [
    { key: "code", label: "Code", type: "text", required: true, max: 32 },
    { key: "name", label: "Name", type: "text", required: true, max: 128 },
    { key: "daysPerYear", label: "Days per year", type: "number", required: true, min: 0, max: 365, help: "0 means no limit." },
    { key: "isPaid", label: "Paid leave", type: "bool" },
    { key: "isActive", label: "Active", type: "bool" },
  ],
  columns: ["code", "name", "daysPerYear", "isPaid", "isActive"],
  searchable: ["code", "name"],
  filters: ["isPaid", "isActive"],
  attrs: () => ({}),
  async prepare(_c, data, existing) {
    return existing ? data : { isPaid: true, isActive: true, ...data };
  },
};

// ──────────────────────────────────────────────────────────────── leave requests

/** Fills in the employee (own, unless HR names another) and the login copies PBAC compares. */
async function resolveEmployee(
  c: { user: { id: string }; tenantId: string; deps: import("./hr-module").ModuleDeps },
  data: Record<string, unknown>,
  existing?: Rec,
): Promise<Rec> {
  const id = (data.employeeId as string | null | undefined) ?? (existing?.employeeId as string | undefined);
  const emp = id ? await c.deps.repos.employees.get(id) : await c.deps.extras.employeeByUser(c.tenantId, c.user.id);
  if (!emp || emp.tenantId !== c.tenantId || emp.deletedAt) {
    throw new ValidationError(
      id ? "Unknown employee" : "Your login is not linked to an employee record, so choose an employee",
      [{ field: "employeeId", message: id ? "not found" : "required" }],
    );
  }
  return emp;
}

const leaveActions: ActionDef[] = [
  {
    key: "submit",
    label: "Submit",
    pbacAction: "submit",
    scope: "record",
    from: ["draft"],
    to: "submitted",
    tone: "primary",
    async run({ record, deps }) {
      const r = record!;
      const type = await deps.repos["leave-types"].get(String(r.leaveTypeId));
      const allowance = Number(type?.daysPerYear ?? 0);
      if (allowance > 0) {
        const year = (r.startDate as Date).getUTCFullYear();
        const used = await deps.extras.leaveUsed(String(r.employeeId), String(r.leaveTypeId), year, r.id);
        if (used + Number(r.days) > allowance) {
          throw new ConflictError(
            `Not enough ${str(type?.name).toLowerCase()} left: ${allowance - used} day(s) remain in ${year}, this request needs ${Number(r.days)}`,
          );
        }
      }
    },
  },
  {
    key: "approve",
    label: "Approve",
    pbacAction: "approve",
    scope: "record",
    from: ["submitted"],
    to: "approved",
    note: "optional",
    tone: "primary",
    async run({ user, note, now }) {
      return { mode: "update", data: { decidedBy: user.id, decidedAt: now, decisionNote: note ?? null } };
    },
  },
  {
    key: "reject",
    label: "Reject",
    pbacAction: "reject",
    scope: "record",
    from: ["submitted"],
    to: "rejected",
    note: "required",
    tone: "danger",
    async run({ user, note, now }) {
      return { mode: "update", data: { decidedBy: user.id, decidedAt: now, decisionNote: note ?? null } };
    },
  },
  {
    key: "cancel",
    label: "Cancel",
    pbacAction: "update",
    scope: "record",
    from: ["draft", "submitted", "approved"],
    to: "cancelled",
    note: "optional",
    tone: "danger",
    async run({ note }) {
      return { mode: "update", data: { decisionNote: note ?? null } };
    },
  },
];

const leaveRequests: ModuleConfig = {
  key: "leave-requests",
  label: "Leave requests",
  singular: "Leave request",
  resource: "leave_request",
  soft: true,
  scoped: true,
  fields: [
    { key: "employeeId", label: "Employee", type: "ref", ref: "employees", help: "Leave blank to request for yourself." },
    { key: "leaveTypeId", label: "Leave type", type: "ref", ref: "leaveTypes", required: true },
    { key: "startDate", label: "From", type: "date", required: true },
    { key: "endDate", label: "To", type: "date", required: true },
    { key: "reason", label: "Reason", type: "textarea", max: 255 },
    { key: "days", label: "Working days", type: "number", readOnly: true },
    { key: "status", label: "Status", type: "select", options: opts(LEAVE_STATUSES), readOnly: true },
    { key: "decidedAt", label: "Decided at", type: "datetime", readOnly: true },
    { key: "decisionNote", label: "Decision note", type: "text", readOnly: true },
    { key: "employeeName", label: "Employee", type: "text", display: true },
    { key: "leaveTypeName", label: "Leave type", type: "text", display: true },
  ],
  columns: ["employeeName", "leaveTypeName", "startDate", "endDate", "days", "status"],
  searchable: ["reason"],
  filters: ["status", "leaveTypeId", "employeeId"],
  actions: leaveActions,
  attrs: (r) => ({ ownerId: r.ownerUserId as string | null, managerId: r.managerUserId as string | null, status: r.status as string }),
  async prepare(c, data, existing) {
    const { deps, tenantId } = c;
    if (existing && !["draft", "submitted"].includes(String(existing.status))) {
      throw new ConflictError(`A ${str(existing.status)} request can no longer be edited`);
    }
    const out = { ...data };
    const emp = await resolveEmployee(c, data, existing);
    out.employeeId = emp.id;
    out.ownerUserId = (emp.userId as string | null) ?? null;
    out.managerUserId = (emp.managerUserId as string | null) ?? null;

    const typeId = String(pick(data, existing, "leaveTypeId"));
    const type = await deps.repos["leave-types"].get(typeId);
    if (!type || type.tenantId !== tenantId || type.deletedAt || !type.isActive) {
      throw new ValidationError("Unknown or inactive leave type", [{ field: "leaveTypeId", message: "not available" }]);
    }

    const start = pick(data, existing, "startDate") as Date;
    const end = pick(data, existing, "endDate") as Date;
    if (end < start) throw new ValidationError("The end date is before the start date", [{ field: "endDate", message: "must not be before the start date" }]);
    const days = countWeekdays(start, end);
    if (days === 0) throw new ValidationError("That range has no working days", [{ field: "startDate", message: "pick at least one weekday" }]);
    out.days = days;

    if (await deps.extras.overlappingLeave(emp.id, start, end, existing?.id)) {
      throw new ConflictError("This employee already has leave on some of those dates");
    }
    if (!existing) out.status = "draft";
    return out;
  },
};

// ───────────────────────────────────────────────────────────────── attendance

const attendanceActions: ActionDef[] = [
  {
    key: "clock-in",
    label: "Clock in",
    pbacAction: "create",
    scope: "collection",
    tone: "primary",
    async run(c) {
      const emp = await c.deps.extras.employeeByUser(c.tenantId, c.user.id);
      if (!emp) throw new ValidationError("Your login is not linked to an employee record", [{ field: "employeeId", message: "required" }]);
      const day = today(c.now);
      const existing = await c.deps.extras.attendanceFor(emp.id, day);
      if (existing) throw new InvalidTransitionError("You have already clocked in today");
      return {
        mode: "create",
        data: {
          employeeId: emp.id,
          ownerUserId: emp.userId ?? null,
          managerUserId: emp.managerUserId ?? null,
          date: day,
          clockIn: c.now,
          status: "present",
        },
      };
    },
  },
  {
    key: "clock-out",
    label: "Clock out",
    pbacAction: "submit",
    scope: "collection",
    async run(c) {
      const emp = await c.deps.extras.employeeByUser(c.tenantId, c.user.id);
      if (!emp) throw new ValidationError("Your login is not linked to an employee record", [{ field: "employeeId", message: "required" }]);
      const existing = await c.deps.extras.attendanceFor(emp.id, today(c.now));
      if (!existing || !existing.clockIn) throw new InvalidTransitionError("You have not clocked in today");
      if (existing.clockOut) throw new InvalidTransitionError("You have already clocked out today");
      return {
        mode: "update-other",
        existing,
        data: { clockOut: c.now, hours: hoursBetween(existing.clockIn as Date, c.now) },
      };
    },
  },
];

const attendance: ModuleConfig = {
  key: "attendance",
  label: "Attendance",
  singular: "Attendance record",
  resource: "attendance",
  soft: true,
  scoped: true,
  fields: [
    { key: "employeeId", label: "Employee", type: "ref", ref: "employees", help: "Leave blank for yourself." },
    { key: "date", label: "Date", type: "date", required: true },
    { key: "clockIn", label: "Clock in", type: "datetime" },
    { key: "clockOut", label: "Clock out", type: "datetime" },
    { key: "status", label: "Status", type: "select", required: true, options: opts(ATTENDANCE_STATUSES) },
    { key: "note", label: "Note", type: "text", max: 255 },
    { key: "hours", label: "Hours", type: "number", readOnly: true },
    { key: "employeeName", label: "Employee", type: "text", display: true },
  ],
  columns: ["employeeName", "date", "clockIn", "clockOut", "hours", "status"],
  searchable: ["note"],
  filters: ["status", "employeeId"],
  actions: attendanceActions,
  attrs: (r) => ({ ownerId: r.ownerUserId as string | null, managerId: r.managerUserId as string | null, status: r.status as string }),
  async prepare(c, data, existing) {
    const out = { ...data };
    const emp = await resolveEmployee(c, data, existing);
    out.employeeId = emp.id;
    out.ownerUserId = (emp.userId as string | null) ?? null;
    out.managerUserId = (emp.managerUserId as string | null) ?? null;
    const a = pick(data, existing, "clockIn") as Date | null | undefined;
    const b = pick(data, existing, "clockOut") as Date | null | undefined;
    if (a && b) {
      if (b < a) throw new ValidationError("Clock out is before clock in", [{ field: "clockOut", message: "must be after clock in" }]);
      out.hours = hoursBetween(a, b);
    } else if ("clockIn" in data || "clockOut" in data) {
      out.hours = null;
    }
    return out;
  },
};

// ───────────────────────────────────────────────────────────────── candidates

const candidates: ModuleConfig = {
  key: "candidates",
  label: "Candidates",
  singular: "Candidate",
  resource: "candidate",
  soft: true,
  scoped: false,
  fields: [
    { key: "firstName", label: "First name", type: "text", required: true, max: 128 },
    { key: "lastName", label: "Last name", type: "text", required: true, max: 128 },
    { key: "email", label: "Email", type: "email", required: true },
    { key: "phone", label: "Phone", type: "phone" },
    { key: "position", label: "Position applied for", type: "text", required: true, max: 128 },
    { key: "stage", label: "Stage", type: "select", required: true, options: opts(CANDIDATE_STAGES) },
    { key: "source", label: "Source", type: "text", max: 64, help: "Referral, job board, agency, ..." },
    { key: "expectedSalary", label: "Expected salary", type: "money", sensitive: true },
    { key: "appliedAt", label: "Applied on", type: "date", required: true },
    { key: "notes", label: "Notes", type: "textarea", max: 500 },
    { key: "fullName", label: "Name", type: "text", display: true },
  ],
  columns: ["fullName", "position", "stage", "source", "appliedAt"],
  searchable: ["firstName", "lastName", "email", "position"],
  filters: ["stage"],
  attrs: (r) => ({ status: r.stage as string }),
};

// ────────────────────────────────────────────────────────────── payroll runs

const payrollActions: ActionDef[] = [
  {
    key: "generate",
    label: "Generate payslips",
    pbacAction: "update",
    scope: "record",
    from: ["draft", "generated"],
    to: "generated",
    tone: "primary",
    async run({ record, deps, user }) {
      const percent = Number(await deps.settings.get("payroll.deduction_percent"));
      const t = await deps.extras.generatePayslips(record!, percent, user.id);
      return {
        mode: "update",
        data: { employeeCount: t.count, totalGross: t.gross, totalDeductions: t.deductions, totalNet: t.net },
      };
    },
  },
  {
    key: "lock",
    label: "Lock",
    pbacAction: "lock",
    scope: "record",
    from: ["generated"],
    to: "locked",
    async run({ now }) {
      return { mode: "update", data: { lockedAt: now } };
    },
  },
  {
    key: "publish",
    label: "Publish to employees",
    pbacAction: "publish",
    scope: "record",
    from: ["locked"],
    to: "published",
    tone: "primary",
    async run({ record, now, deps }) {
      await deps.extras.publishPayslips(record!.id);
      return { mode: "update", data: { publishedAt: now } };
    },
  },
];

const payrollRuns: ModuleConfig = {
  key: "payroll-runs",
  label: "Payroll runs",
  singular: "Payroll run",
  resource: "payroll_run",
  soft: true,
  scoped: false,
  fields: [
    { key: "period", label: "Period (YYYY-MM)", type: "text", required: true, max: 7 },
    { key: "status", label: "Status", type: "select", options: opts(PAYROLL_STATUSES), readOnly: true },
    { key: "employeeCount", label: "Employees", type: "number", readOnly: true },
    { key: "totalGross", label: "Total gross", type: "money", readOnly: true },
    { key: "totalDeductions", label: "Total deductions", type: "money", readOnly: true },
    { key: "totalNet", label: "Total net", type: "money", readOnly: true },
    { key: "lockedAt", label: "Locked at", type: "datetime", readOnly: true },
    { key: "publishedAt", label: "Published at", type: "datetime", readOnly: true },
  ],
  columns: ["period", "status", "employeeCount", "totalGross", "totalDeductions", "totalNet"],
  searchable: ["period"],
  filters: ["status"],
  actions: payrollActions,
  attrs: (r) => ({ status: r.status as string }),
  async prepare(_c, data, existing) {
    const out = { ...data };
    if ("period" in data && !isPeriod(String(data.period))) {
      throw new ValidationError("Use the format YYYY-MM", [{ field: "period", message: "for example 2026-10" }]);
    }
    if (existing && existing.status !== "draft") {
      throw new ConflictError("Only a draft run can be edited");
    }
    if (!existing) out.status = "draft";
    return out;
  },
};

// ──────────────────────────────────────────────────────────────── payslips

const payslips: ModuleConfig = {
  key: "payslips",
  label: "Payslips",
  singular: "Payslip",
  resource: "payslip",
  scoped: true,
  readOnly: true,
  fields: [
    { key: "runId", label: "Run", type: "text", display: true },
    { key: "runPeriod", label: "Period", type: "text", display: true },
    { key: "employeeName", label: "Employee", type: "text", display: true },
    { key: "gross", label: "Gross", type: "money", readOnly: true },
    { key: "deductions", label: "Deductions", type: "money", readOnly: true },
    { key: "net", label: "Net pay", type: "money", readOnly: true },
    { key: "status", label: "Status", type: "text", readOnly: true },
  ],
  columns: ["runPeriod", "employeeName", "gross", "deductions", "net", "status"],
  searchable: [],
  filters: ["status", "runId"],
  attrs: (r) => ({ ownerId: r.ownerUserId as string | null, managerId: r.managerUserId as string | null, status: r.status as string }),
};

export const MODULE_CONFIGS: ModuleConfig[] = [
  orgUnits,
  employees,
  leaveTypes,
  leaveRequests,
  attendance,
  candidates,
  payrollRuns,
  payslips,
];

