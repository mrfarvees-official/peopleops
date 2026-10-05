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
      "leave_type",
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
    actions: [...READ, "create", "update", "approve", "reject"],
    resources: ["leave_request", "attendance"],
  },
  {
    code: "hr-manager-candidates",
    name: "HR manager: follow the hiring pipeline",
    effect: "allow",
    roles: ["hr_manager"],
    actions: [...READ, "export"],
    resources: ["candidate"],
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
    code: "payroll-officer-read-time",
    name: "Payroll officer: read leave and attendance (unpaid leave, hours)",
    effect: "allow",
    roles: ["payroll_officer"],
    actions: READ,
    resources: ["leave_request", "attendance"],
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

  // ───────────── self-service: everyone is an employee ─────────────
  {
    code: "employee-own-records",
    name: "Everyone: view own records",
    effect: "allow",
    roles: "*",
    actions: ["view"],
    resources: ["employee", "leave_request", "attendance"],
    conditions: [OWNED_BY_ME],
  },
  {
    code: "employee-own-payslips",
    name: "Everyone: view own published payslips",
    effect: "allow",
    roles: "*",
    actions: ["view"],
    resources: ["payslip"],
    conditions: [
      OWNED_BY_ME,
      { attribute: "resource.status", operator: "eq", value: "published" },
    ],
  },
  {
    code: "employee-edit-own-open-leave",
    name: "Everyone: edit or cancel own leave while it is still open",
    effect: "allow",
    roles: "*",
    actions: ["update"],
    resources: ["leave_request"],
    conditions: [
      OWNED_BY_ME,
      { attribute: "resource.status", operator: "in", value: ["draft", "submitted"] },
    ],
  },
  {
    code: "employee-submit-own",
    name: "Everyone: submit own requests",
    effect: "allow",
    roles: "*",
    actions: ["submit"],
    resources: ["leave_request", "attendance"],
    conditions: [OWNED_BY_ME],
  },
  {
    code: "employee-create-requests",
    name: "Everyone: raise leave and attendance entries",
    effect: "allow",
    roles: "*",
    actions: ["create"],
    resources: ["leave_request", "attendance"],
    conditions: [OWNED_BY_ME],
  },
  {
    code: "employee-list-own",
    name: "Everyone: may list own records (rows scoped in query)",
    effect: "allow",
    roles: "*",
    actions: ["viewAny"],
    resources: ["employee", "leave_request", "attendance", "payslip"],
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
  {
    code: "auditor-read-payslips",
    name: "Auditor: review payslips and export them as evidence",
    effect: "allow",
    roles: ["auditor"],
    actions: [...READ, "export"],
    resources: ["payslip"],
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

  {
    code: "everyone-read-leave-types",
    name: "Everyone: read leave types",
    effect: "allow",
    roles: "*",
    actions: READ,
    resources: ["leave_type"],
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
    code: "deny-delete-active-employee",
    name: "An employee record is only deleted after they have left (terminate first)",
    effect: "deny",
    roles: "*",
    actions: ["delete"],
    resources: ["employee"],
    conditions: [
      { attribute: "resource.status", operator: "neq", value: "terminated" },
    ],
  },
  {
    code: "deny-change-closed-payroll",
    name: "A locked or published payroll run cannot be edited or deleted",
    effect: "deny",
    roles: "*",
    actions: ["update", "delete"],
    resources: ["payroll_run"],
    conditions: [
      {
        attribute: "resource.status",
        operator: "in",
        value: ["locked", "published"],
      },
    ],
  },
  {
    code: "deny-manual-payslip-change",
    name: "Payslips are produced by payroll runs and never typed in or edited",
    effect: "deny",
    roles: "*",
    actions: ["create", "update", "delete"],
    resources: ["payslip"],
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
