import { ROLES } from "./catalogues";

type Many = readonly string[] | "*";
type Operator =
  | "eq"
  | "neq"
  | "in"
  | "not_in"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "exists";

export interface PolicyDef {
  code: string;
  name: string;
  effect: "allow" | "deny";
  roles: Many; // "*" = any subject
  actions: Many; // "*" = any action
  resources: Many; // "*" = any resource
  conditions?: {
    attribute: string;
    operator: Operator;
    value?: string | number | boolean | string[];
    ref?: string;
  }[];
}

const READ = ["view", "viewAny"] as const;

// system_developer is deliberately absent: it bypasses PBAC in the engine.
// super_admin lives in the platform tenant and is the only role allowed across tenants.
const TENANT_BOUND_ROLES = ROLES.map((r) => r.code as string).filter(
  (c) => c !== "super_admin" && c !== "system_developer",
);

const OWNED_BY_ME = {
  attribute: "resource.ownerId",
  operator: "eq",
  ref: "subject.id",
} as const;

const MANAGED_BY_ME = {
  attribute: "resource.managerId",
  operator: "eq",
  ref: "subject.id",
} as const;

export const POLICIES: PolicyDef[] = [
  // ───────────── super_admin ─────────────
  {
    code: "super-admin-full-access",
    name: "Super admin: everything (still bound by global denies)",
    effect: "allow",
    roles: ["super_admin"],
    actions: "*",
    resources: "*",
  },

  // ───────────── hr_admin ─────────────
  {
    code: "hr-admin-manage-people",
    name: "HR admin: full control of people data",
    effect: "allow",
    roles: ["hr_admin"],
    actions: "*",
    resources: [
      "user",
      "org_unit",
      "employee",
      "leave_request",
      "attendance",
      "candidate",
      "report",
    ],
  },
  {
    code: "hr-admin-read-roles",
    name: "HR admin: read roles",
    effect: "allow",
    roles: ["hr_admin"],
    actions: READ,
    resources: ["role"],
  },

  // ───────────── hr_manager ─────────────
  {
    code: "hr-manager-employees",
    name: "HR manager: manage employees",
    effect: "allow",
    roles: ["hr_manager"],
    actions: [...READ, "create", "update", "export"],
    resources: ["employee"],
  },
  {
    code: "hr-manager-requests",
    name: "HR manager: process leave and attendance",
    effect: "allow",
    roles: ["hr_manager"],
    actions: [...READ, "approve", "reject"],
    resources: ["leave_request", "attendance"],
  },
  {
    code: "hr-manager-read-org-reports",
    name: "HR manager: read org units and reports",
    effect: "allow",
    roles: ["hr_manager"],
    actions: [...READ, "export"],
    resources: ["org_unit", "report"],
  },

  // ───────────── payroll_officer ─────────────
  {
    code: "payroll-officer-payroll",
    name: "Payroll officer: run payroll and payslips",
    effect: "allow",
    roles: ["payroll_officer"],
    actions: "*",
    resources: ["payroll_run", "payslip"],
  },
  {
    code: "payroll-officer-read-employees",
    name: "Payroll officer: read employees and org units",
    effect: "allow",
    roles: ["payroll_officer"],
    actions: READ,
    resources: ["employee", "org_unit"],
  },
  {
    code: "payroll-officer-reports",
    name: "Payroll officer: reports",
    effect: "allow",
    roles: ["payroll_officer"],
    actions: [...READ, "export"],
    resources: ["report"],
  },

  // ───────────── line_manager ─────────────
  {
    code: "line-manager-team-requests",
    name: "Line manager: act on direct reports' requests",
    effect: "allow",
    roles: ["line_manager"],
    actions: ["view", "approve", "reject"],
    resources: ["leave_request", "attendance"],
    conditions: [MANAGED_BY_ME],
  },
  {
    code: "line-manager-team-employees",
    name: "Line manager: view direct reports",
    effect: "allow",
    roles: ["line_manager"],
    actions: ["view"],
    resources: ["employee"],
    conditions: [MANAGED_BY_ME],
  },
  {
    code: "line-manager-list-team",
    name: "Line manager: may list requests and employees (rows scoped in query)",
    effect: "allow",
    roles: ["line_manager"],
    actions: ["viewAny"],
    resources: ["leave_request", "attendance", "employee"],
  },

  // ───────────── recruiter ─────────────
  {
    code: "recruiter-candidates",
    name: "Recruiter: manage candidates",
    effect: "allow",
    roles: ["recruiter"],
    actions: [...READ, "create", "update", "export"],
    resources: ["candidate"],
  },
  {
    code: "recruiter-read-org",
    name: "Recruiter: read org units",
    effect: "allow",
    roles: ["recruiter"],
    actions: READ,
    resources: ["org_unit"],
  },

  // ───────────── employee ─────────────
  {
    code: "employee-own-records",
    name: "Employee: view own records",
    effect: "allow",
    roles: ["employee"],
    actions: ["view"],
    resources: ["employee", "leave_request", "attendance", "payslip"],
    conditions: [OWNED_BY_ME],
  },
  {
    code: "employee-submit-own",
    name: "Employee: submit own requests",
    effect: "allow",
    roles: ["employee"],
    actions: ["submit"],
    resources: ["leave_request", "attendance"],
    conditions: [OWNED_BY_ME],
  },
  {
    code: "employee-create-requests",
    name: "Employee: raise leave and attendance entries",
    effect: "allow",
    roles: ["employee"],
    actions: ["create"],
    resources: ["leave_request", "attendance"],
    conditions: [OWNED_BY_ME],
  },
  {
    code: "employee-list-own",
    name: "Employee: may list own records (rows scoped in query)",
    effect: "allow",
    roles: ["employee"],
    actions: ["viewAny"],
    resources: ["leave_request", "attendance", "payslip"],
  },

  // ───────────── auditor ─────────────
  {
    code: "auditor-audit-log",
    name: "Auditor: read and export the audit log",
    effect: "allow",
    roles: ["auditor"],
    actions: [...READ, "export"],
    resources: ["audit_log", "report"],
  },
  {
    code: "auditor-read-hr-data",
    name: "Auditor: read-only HR and payroll data",
    effect: "allow",
    roles: ["auditor"],
    actions: READ,
    resources: [
      "employee",
      "leave_request",
      "attendance",
      "payroll_run",
      "org_unit",
    ],
  },

  // ───────────── everyone ─────────────
  {
    code: "everyone-read-org-units",
    name: "Everyone: read org units",
    effect: "allow",
    roles: "*",
    actions: READ,
    resources: ["org_unit"],
  },

  // ───────────── global denies (always win) ─────────────
  {
    code: "deny-self-approval",
    name: "Nobody approves or rejects their own request",
    effect: "deny",
    roles: "*",
    actions: ["approve", "reject"],
    resources: ["leave_request", "attendance", "payroll_run"],
    conditions: [OWNED_BY_ME],
  },
  {
    code: "deny-audit-log-mutation",
    name: "Audit log is read-only",
    effect: "deny",
    roles: "*",
    actions: ["create", "update", "delete", "restore"],
    resources: ["audit_log"],
  },
  {
    code: "deny-cross-tenant",
    name: "Tenant isolation",
    effect: "deny",
    roles: TENANT_BOUND_ROLES,
    actions: "*",
    resources: "*",
    conditions: [
      {
        attribute: "resource.tenantId",
        operator: "neq",
        ref: "subject.tenantId",
      },
    ],
  },
];
