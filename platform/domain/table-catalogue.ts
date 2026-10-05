import type { TableDef } from "./tables";

/**
 * Every table that can be exported, imported, backed up and restored.
 *
 * ADDING A TABLE (do this in the same change that adds the table):
 *   1. Add one entry below, or add its name to EXCLUDED_TABLES with a reason.
 *      A test fails if a table is in neither list.
 *   2. `resource` is the PBAC resource that guards it. Add new resources to
 *      the catalogue seed (prisma/seed/data/catalogues.ts).
 *   3. `scope` says which tenant owns a row. Child tables use "via".
 *   4. Put secrets in `hidden`. They are left out of user exports and imports
 *      but kept in backups so a restore is complete.
 *
 * Nothing else is needed: columns, types and foreign-key order are read from
 * the database.
 */
const t = (d: TableDef): TableDef => d;

export const TABLES: TableDef[] = [
  // ───── tenants and people
  t({
    key: "tenants",
    table: "platform_tenant",
    label: "Companies",
    resource: "tenant",
    scope: { kind: "tenant", column: "id" },
    export: true,
    import: true,
    backup: true,
  }),
  t({
    key: "tenant-profiles",
    table: "platform_tenant_profile",
    label: "Company profiles",
    resource: "tenant",
    scope: { kind: "tenant", column: "tenantId" },
    export: true,
    import: true,
    backup: true,
  }),
  t({
    key: "users",
    table: "platform_user",
    label: "Users",
    resource: "user",
    scope: { kind: "tenant", column: "tenantId" },
    hidden: ["passwordHash"],
    export: true,
    import: false, // a user needs a password hash, which user files never carry
    backup: true,
  }),
  t({
    key: "user-profiles",
    table: "platform_user_profile",
    label: "User profiles",
    resource: "user",
    scope: { kind: "via", column: "userId", parent: "users", parentColumn: "id" },
    export: true,
    import: true,
    backup: true,
  }),
  t({
    key: "user-roles",
    table: "platform_user_role",
    label: "User roles",
    resource: "role",
    scope: { kind: "via", column: "userId", parent: "users", parentColumn: "id" },
    export: true,
    import: true,
    backup: true,
  }),

  // ───── platform catalogues and settings (not tied to one tenant)
  t({
    key: "roles",
    table: "platform_role",
    label: "Roles",
    resource: "role",
    scope: { kind: "global" },
    export: true,
    import: true,
    backup: true,
  }),
  t({
    key: "actions",
    table: "platform_action",
    label: "Actions",
    resource: "permission",
    scope: { kind: "global" },
    export: true,
    import: true,
    backup: true,
  }),
  t({
    key: "resources",
    table: "platform_resource",
    label: "Resources",
    resource: "permission",
    scope: { kind: "global" },
    export: true,
    import: true,
    backup: true,
  }),
  t({
    key: "settings",
    table: "platform_setting",
    label: "Settings",
    resource: "setting",
    scope: { kind: "global" },
    export: true,
    import: true,
    backup: true,
  }),

  // ───── policies
  t({
    key: "policies",
    table: "platform_policy",
    label: "Policies",
    resource: "policy",
    scope: { kind: "tenant", column: "tenantId" },
    export: true,
    import: true,
    backup: true,
  }),
  t({
    key: "policy-subjects",
    table: "platform_policy_subject",
    label: "Policy subjects",
    resource: "policy",
    scope: { kind: "via", column: "policyId", parent: "policies", parentColumn: "id" },
    export: true,
    import: true,
    backup: true,
  }),
  t({
    key: "policy-targets",
    table: "platform_policy_target",
    label: "Policy targets",
    resource: "policy",
    scope: { kind: "via", column: "policyId", parent: "policies", parentColumn: "id" },
    export: true,
    import: true,
    backup: true,
  }),
  t({
    key: "policy-conditions",
    table: "platform_policy_condition",
    label: "Policy conditions",
    resource: "policy",
    scope: { kind: "via", column: "policyId", parent: "policies", parentColumn: "id" },
    export: true,
    import: true,
    backup: true,
  }),


  // ───── HR
  t({
    key: "org-units",
    table: "hr_org_unit",
    label: "Org units",
    resource: "org_unit",
    scope: { kind: "tenant", column: "tenantId" },
    export: true,
    import: true,
    backup: true,
  }),
  t({
    key: "employees",
    table: "hr_employee",
    label: "Employees",
    resource: "employee",
    scope: { kind: "tenant", column: "tenantId" },
    export: true,
    import: true,
    backup: true,
  }),
  t({
    key: "leave-types",
    table: "hr_leave_type",
    label: "Leave types",
    resource: "leave_type",
    scope: { kind: "tenant", column: "tenantId" },
    export: true,
    import: true,
    backup: true,
  }),
  t({
    key: "leave-requests",
    table: "hr_leave_request",
    label: "Leave requests",
    resource: "leave_request",
    scope: { kind: "tenant", column: "tenantId" },
    export: true,
    import: true,
    backup: true,
  }),
  t({
    key: "attendance",
    table: "hr_attendance",
    label: "Attendance",
    resource: "attendance",
    scope: { kind: "tenant", column: "tenantId" },
    export: true,
    import: true,
    backup: true,
  }),
  t({
    key: "candidates",
    table: "hr_candidate",
    label: "Candidates",
    resource: "candidate",
    scope: { kind: "tenant", column: "tenantId" },
    export: true,
    import: true,
    backup: true,
  }),
  t({
    key: "payroll-runs",
    table: "hr_payroll_run",
    label: "Payroll runs",
    resource: "payroll_run",
    scope: { kind: "tenant", column: "tenantId" },
    export: true,
    import: true,
    backup: true,
  }),
  t({
    key: "payslips",
    table: "hr_payslip",
    label: "Payslips",
    resource: "payslip",
    scope: { kind: "tenant", column: "tenantId" },
    export: true,
    import: false, // generated by payroll runs, never typed in or uploaded
    backup: true,
  }),

  // ───── audit
  t({
    key: "audit-log",
    table: "platform_audit_log",
    label: "Audit log",
    resource: "audit_log",
    scope: { kind: "tenant", column: "tenantId" },
    export: true,
    import: false, // the audit log is append-only evidence
    backup: false, // large, and never rewritten by a restore
  }),
];

/** Tables deliberately outside the engine, with the reason. */
export const EXCLUDED_TABLES: Record<string, string> = {
  platform_session: "Live login tokens; never exported or restored.",
  platform_backup: "The backups themselves.",
};
