import { describe, expect, it } from "vitest";
import {
  computePayslip,
  countWeekdays,
  hoursBetween,
  isDate,
  isPeriod,
  periodBounds,
  toDay,
  weekdaysWithin,
} from "@/platform/domain/hr";

describe("leave days", () => {
  it("counts Monday to Friday only", () => {
    // 2026-10-05 is a Monday
    expect(countWeekdays(toDay("2026-10-05"), toDay("2026-10-05"))).toBe(1);
    expect(countWeekdays(toDay("2026-10-05"), toDay("2026-10-09"))).toBe(5);
    expect(countWeekdays(toDay("2026-10-05"), toDay("2026-10-11"))).toBe(5); // weekend not counted
    expect(countWeekdays(toDay("2026-10-10"), toDay("2026-10-11"))).toBe(0); // Sat + Sun
    expect(countWeekdays(toDay("2026-10-05"), toDay("2026-10-19"))).toBe(11);
  });

  it("is zero when the end is before the start", () => {
    expect(countWeekdays(toDay("2026-10-09"), toDay("2026-10-05"))).toBe(0);
  });

  it("counts only the part inside a window", () => {
    const from = toDay("2026-10-01");
    const to = toDay("2026-10-31");
    expect(weekdaysWithin(toDay("2026-09-28"), toDay("2026-10-02"), from, to)).toBe(2); // Thu, Fri
    expect(weekdaysWithin(toDay("2026-10-29"), toDay("2026-11-04"), from, to)).toBe(2); // Thu, Fri (31st is a Saturday)
    expect(weekdaysWithin(toDay("2026-11-02"), toDay("2026-11-04"), from, to)).toBe(0);
  });

  it("knows a month's working days", () => {
    expect(periodBounds("2026-10").workingDays).toBe(22);
    expect(periodBounds("2026-02").to.toISOString().slice(0, 10)).toBe("2026-02-28");
  });

  it("validates dates and periods", () => {
    expect(isDate("2026-10-05")).toBe(true);
    expect(isDate("2026-13-01")).toBe(false);
    expect(isDate("05/10/2026")).toBe(false);
    expect(isPeriod("2026-10")).toBe(true);
    expect(isPeriod("2026-13")).toBe(false);
    expect(isPeriod("2026-1")).toBe(false);
  });
});

describe("payslips", () => {
  it("applies the standard deduction to the salary", () => {
    const p = computePayslip({ monthlySalary: 100000, deductionPercent: 10, unpaidDays: 0, workingDays: 22 });
    expect(p).toMatchObject({ gross: 100000, deductions: 10000, net: 90000 });
    expect(p.details).toMatchObject({ basic: 100000, standardDeduction: 10000, unpaidLeaveDeduction: 0 });
  });

  it("takes unpaid leave off first, then deducts on what was earned", () => {
    const p = computePayslip({ monthlySalary: 110000, deductionPercent: 10, unpaidDays: 2, workingDays: 22 });
    expect(p.details.unpaidLeaveDeduction).toBe(10000); // 2/22 of 110000
    expect(p.details.standardDeduction).toBe(10000); // 10% of 100000
    expect(p).toMatchObject({ gross: 110000, deductions: 20000, net: 90000 });
  });

  it("never deducts more than the month and rounds to cents", () => {
    const p = computePayslip({ monthlySalary: 1000, deductionPercent: 0, unpaidDays: 99, workingDays: 22 });
    expect(p).toMatchObject({ deductions: 1000, net: 0 });
    const q = computePayslip({ monthlySalary: 1000.55, deductionPercent: 7.5, unpaidDays: 0, workingDays: 22 });
    expect(q.deductions).toBe(75.04);
    expect(q.net).toBe(925.51);
  });
});

describe("attendance", () => {
  it("measures hours worked", () => {
    expect(hoursBetween(new Date("2026-10-05T09:00:00Z"), new Date("2026-10-05T17:30:00Z"))).toBe(8.5);
    expect(hoursBetween(new Date("2026-10-05T17:00:00Z"), new Date("2026-10-05T09:00:00Z"))).toBe(0);
  });
});
