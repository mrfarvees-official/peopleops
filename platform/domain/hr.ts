/**
 * HR domain rules: field metadata shared by the API and the UI, plus the pure
 * calculations (leave days, payroll) so they can be tested without a database.
 */

// ───────────────────────────────────────────────────────────── field metadata

export type FieldType =
  | "text"
  | "textarea"
  | "email"
  | "phone"
  | "number"
  | "money"
  | "date"
  | "datetime"
  | "bool"
  | "select" // one of `options`
  | "ref"; // one record from another module, chosen by name (see RefSource)

export type RefSource = "employees" | "orgUnits" | "leaveTypes";

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  max?: number; // text length, or maximum for numbers
  min?: number;
  options?: FieldOption[]; // for "select"
  ref?: RefSource; // for "ref"
  /** Set by the system or an action; never accepted from a form or API body. */
  readOnly?: boolean;
  /** Computed for display (e.g. a name); not stored from input. */
  display?: boolean;
  /** Only shown to people who may edit the record or own it (e.g. salary). */
  sensitive?: boolean;
  help?: string;
}

export const ymd = (d: Date) => d.toISOString().slice(0, 10);

export const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(`${v}T00:00:00Z`));

export const toDay = (v: string) => new Date(`${v}T00:00:00.000Z`);

// ─────────────────────────────────────────────────────────────────── statuses

export const LEAVE_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Submitted" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
] as const;

export const EMPLOYMENT_TYPES = [
  { value: "full_time", label: "Full time" },
  { value: "part_time", label: "Part time" },
  { value: "contract", label: "Contract" },
  { value: "intern", label: "Intern" },
] as const;

export const EMPLOYEE_STATUSES = [
  { value: "active", label: "Active" },
  { value: "on_leave", label: "On leave" },
  { value: "terminated", label: "Terminated" },
] as const;

export const ATTENDANCE_STATUSES = [
  { value: "present", label: "Present" },
  { value: "late", label: "Late" },
  { value: "half_day", label: "Half day" },
  { value: "remote", label: "Remote" },
  { value: "absent", label: "Absent" },
] as const;

export const CANDIDATE_STAGES = [
  { value: "applied", label: "Applied" },
  { value: "screening", label: "Screening" },
  { value: "interview", label: "Interview" },
  { value: "offer", label: "Offer" },
  { value: "hired", label: "Hired" },
  { value: "rejected", label: "Rejected" },
] as const;

export const PAYROLL_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "generated", label: "Generated" },
  { value: "locked", label: "Locked" },
  { value: "published", label: "Published" },
] as const;

// ───────────────────────────────────────────────────────────────── leave days

const DAY = 86_400_000;
const isWeekday = (d: Date) => d.getUTCDay() !== 0 && d.getUTCDay() !== 6;

/** Working days (Monday to Friday) from start to end, both included. */
export function countWeekdays(start: Date, end: Date): number {
  if (end < start) return 0;
  let n = 0;
  for (let t = start.getTime(); t <= end.getTime(); t += DAY) {
    if (isWeekday(new Date(t))) n++;
  }
  return n;
}

/** Working days of [start, end] that fall inside [from, to]. */
export function weekdaysWithin(start: Date, end: Date, from: Date, to: Date): number {
  const s = start > from ? start : from;
  const e = end < to ? end : to;
  return countWeekdays(s, e);
}

export function periodBounds(period: string): { from: Date; to: Date; workingDays: number } {
  const [y, m] = period.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m, 0));
  return { from, to, workingDays: countWeekdays(from, to) };
}

export const isPeriod = (v: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

// ──────────────────────────────────────────────────────────────────── payroll

export interface PayslipInput {
  monthlySalary: number;
  deductionPercent: number; // statutory/standard deduction, from the payroll.deduction_percent setting
  unpaidDays: number; // approved unpaid leave days inside the period
  workingDays: number; // working days in the period
}

export interface PayslipResult {
  gross: number;
  deductions: number;
  net: number;
  details: {
    basic: number;
    deductionPercent: number;
    standardDeduction: number;
    unpaidDays: number;
    workingDays: number;
    unpaidLeaveDeduction: number;
  };
}

const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function computePayslip(i: PayslipInput): PayslipResult {
  const basic = money(i.monthlySalary);
  const unpaidLeaveDeduction =
    i.workingDays > 0 ? money((basic * Math.min(i.unpaidDays, i.workingDays)) / i.workingDays) : 0;
  // The standard deduction applies to what was actually earned.
  const earned = money(basic - unpaidLeaveDeduction);
  const standardDeduction = money((earned * i.deductionPercent) / 100);
  const deductions = money(unpaidLeaveDeduction + standardDeduction);
  return {
    gross: basic,
    deductions,
    net: money(basic - deductions),
    details: {
      basic,
      deductionPercent: i.deductionPercent,
      standardDeduction,
      unpaidDays: i.unpaidDays,
      workingDays: i.workingDays,
      unpaidLeaveDeduction,
    },
  };
}

// ─────────────────────────────────────────────────────────────── attendance

/** Hours between clock in and out, to two decimals. */
export function hoursBetween(a: Date, b: Date): number {
  return money(Math.max(0, b.getTime() - a.getTime()) / 3_600_000);
}

// ──────────────────────────────────────────────────────────────────── errors

function named(name: string) {
  return class extends Error {
    constructor(message: string, readonly details?: unknown) {
      super(message);
      this.name = name;
    }
  };
}

export const ValidationError = named("ValidationError");
export const RecordNotFoundError = named("RecordNotFoundError");
export const ConflictError = named("ConflictError");
export const InvalidTransitionError = named("InvalidTransitionError");
export const ModuleNotFoundError = named("ModuleNotFoundError");
export const ReadOnlyModuleError = named("ReadOnlyModuleError");
