import { ROLES } from "@/prisma/seed/data/catalogues";
import { USERS } from "@/prisma/seed/data/users";

// What each seeded demo login is good for, written for someone trying the product.
const TRY: Record<string, string> = {
  hr_admin: "Full HR access: employees, org units, leave types, settings, backups and import/export.",
  hr_manager: "Approve leave, manage employees and review hiring across the company.",
  payroll_officer: "Run monthly payroll, review payslips and publish them.",
  line_manager: "See your team, approve their leave and track attendance.",
  recruiter: "Work the hiring pipeline: candidates, stages and moving people toward hire.",
  employee: "The self-service view: your profile, leave, attendance and payslips only.",
  auditor: "Read-only oversight with access to the audit log. Cannot change anything.",
};

export type DemoAccount = {
  role: string;
  roleName: string;
  name: string;
  email: string;
  tryThis: string;
};

// The demo company's logins. The platform-level super admin is intentionally left out.
export const DEMO_ACCOUNTS: DemoAccount[] = USERS.filter(
  (u) => u.tenant === "demo",
).map((u) => ({
  role: u.role,
  roleName: ROLES.find((r) => r.code === u.role)?.name ?? u.role,
  name: `${u.first} ${u.last}`.trim(),
  email: `${u.role}@${u.tenant}.com`,
  tryThis: TRY[u.role] ?? "",
}));
