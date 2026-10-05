/**
 * Every sidebar item lives here. Add a new screen by adding one entry.
 * `requires` hides the item unless PBAC lets the user perform that action.
 */
export interface MenuItem {
  label: string;
  href: string;
  section: string;
  requires?: { action: string; resource: string };
}

export const MENU: MenuItem[] = [
  { label: "Dashboard", href: "/dashboard", section: "General" },

  {
    label: "Employees",
    href: "/hr/employees",
    section: "People",
    requires: { action: "viewAny", resource: "employee" },
  },
  {
    label: "Org units",
    href: "/hr/org-units",
    section: "People",
    requires: { action: "viewAny", resource: "org_unit" },
  },

  {
    label: "Leave requests",
    href: "/hr/leave-requests",
    section: "Time and leave",
    requires: { action: "viewAny", resource: "leave_request" },
  },
  {
    label: "Attendance",
    href: "/hr/attendance",
    section: "Time and leave",
    requires: { action: "viewAny", resource: "attendance" },
  },

  {
    label: "Candidates",
    href: "/hr/candidates",
    section: "Recruitment",
    requires: { action: "viewAny", resource: "candidate" },
  },

  {
    label: "Payroll runs",
    href: "/hr/payroll-runs",
    section: "Payroll",
    requires: { action: "viewAny", resource: "payroll_run" },
  },
  {
    label: "Payslips",
    href: "/hr/payslips",
    section: "Payroll",
    requires: { action: "viewAny", resource: "payslip" },
  },

  {
    label: "Reports",
    href: "/hr/reports",
    section: "Insights",
    requires: { action: "viewAny", resource: "report" },
  },

  {
    label: "Leave types",
    href: "/hr/leave-types",
    section: "Configuration",
    requires: { action: "create", resource: "leave_type" },
  },

  {
    label: "Policies",
    href: "/pbac/policies",
    section: "Administration",
    requires: { action: "viewAny", resource: "policy" },
  },
  {
    label: "Audit log",
    href: "/audit",
    section: "Administration",
    requires: { action: "viewAny", resource: "audit_log" },
  },
];
