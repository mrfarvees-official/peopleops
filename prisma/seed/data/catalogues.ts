export const ROLES = [
  { code: "super_admin", name: "Super admin" },
  { code: "hr_admin", name: "HR admin" },
  { code: "hr_manager", name: "HR manager" },
  { code: "payroll_officer", name: "Payroll officer" },
  { code: "line_manager", name: "Line manager" },
  { code: "recruiter", name: "Recruiter" },
  { code: "employee", name: "Employee" },
  { code: "auditor", name: "Auditor" },
] as const;

export const ACTIONS = [
  "view", "viewAny", "create", "update", "delete", "restore",
  "submit", "approve", "reject", "lock", "publish", "export",
] as const;

export const RESOURCES = [
  "tenant", "user", "role", "policy", "subject", "condition", "permission", "audit_log", "org_unit", "employee",
  "leave_request", "attendance", "payroll_run", "payslip", "candidate", "report",
] as const;