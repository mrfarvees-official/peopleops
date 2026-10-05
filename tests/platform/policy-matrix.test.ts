import { describe, expect, it } from "vitest";
import { evaluate, type Policy } from "@/platform/domain/pbac";
import { POLICIES, type PolicyDef } from "@/prisma/seed/data/pbac";

// The seeded policies, expanded the same way the seeder stores them.
function expand(def: PolicyDef): Policy {
  const roles = def.roles === "*" ? null : def.roles;
  const actions = def.actions === "*" ? [null] : def.actions;
  const resources = def.resources === "*" ? [null] : def.resources;
  return {
    id: def.code,
    code: def.code,
    effect: def.effect,
    subjects: roles ? roles.map((role) => ({ type: "role" as const, role })) : [{ type: "any" as const }],
    targets: actions.flatMap((action) => resources.map((resource) => ({ action, resource }))),
    conditions: (def.conditions ?? []).map((c) => ({ ...c })),
  };
}
const all = POLICIES.map(expand);

const ME = "me";
const OTHER = "someone-else";

/** Would `role` be allowed to do `action` to a record, in the same company? */
function allowed(role: string, action: string, type: string, attrs: Record<string, unknown> = {}, tenantId = "t1") {
  return evaluate(all, {
    subject: { id: ME, tenantId: "t1", roles: [role] },
    action,
    resource: { type, tenantId, ...attrs },
  }).allowed;
}
const mine = { ownerId: ME };
const theirs = { ownerId: OTHER };
const myReport = { ownerId: OTHER, managerId: ME };

const HR_RESOURCES = ["employee", "org_unit", "leave_type", "leave_request", "attendance", "candidate", "payroll_run", "payslip", "report"];

describe("seeded policies cover every implemented resource", () => {
  it.each(HR_RESOURCES)("%s can be viewed, and listed, by some company role (not only super admin)", (type) => {
    const roles = ["hr_admin", "hr_manager", "payroll_officer", "line_manager", "recruiter", "employee", "auditor"];
    expect(roles.some((r) => allowed(r, "viewAny", type)), `viewAny ${type}`).toBe(true);
    expect(roles.some((r) => allowed(r, "view", type, mine) || allowed(r, "view", type)), `view ${type}`).toBe(true);
  });

  it("every policy names only known actions and resources", async () => {
    const { ACTIONS, RESOURCES } = await import("@/prisma/seed/data/catalogues");
    for (const p of POLICIES) {
      const a = p.actions === "*" ? [] : p.actions;
      const r = p.resources === "*" ? [] : p.resources;
      for (const x of a) expect(ACTIONS as readonly string[], `${p.code}: action ${x}`).toContain(x);
      for (const x of r) expect(RESOURCES as readonly string[], `${p.code}: resource ${x}`).toContain(x);
    }
  });

  it("policy codes are unique", () => {
    const codes = POLICIES.map((p) => p.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("everyone: their own records", () => {
  it.each(["employee", "hr_manager", "recruiter", "auditor", "line_manager", "payroll_officer"])("%s uses self-service", (role) => {
    expect(allowed(role, "view", "employee", mine)).toBe(true);
    expect(allowed(role, "create", "leave_request", mine)).toBe(true);
    expect(allowed(role, "submit", "leave_request", mine)).toBe(true);
    expect(allowed(role, "create", "attendance", mine)).toBe(true);
    expect(allowed(role, "submit", "attendance", mine)).toBe(true); // clock out
    expect(allowed(role, "view", "payslip", { ...mine, status: "published" })).toBe(true);
  });

  it("an employee gets nothing extra", () => {
    expect(allowed("employee", "view", "employee", theirs)).toBe(false);
    expect(allowed("employee", "update", "employee", mine)).toBe(false);
    expect(allowed("employee", "view", "payslip", { ...mine, status: "draft" })).toBe(false);
    expect(allowed("employee", "view", "payslip", { ...theirs, status: "published" })).toBe(false);
    expect(allowed("employee", "update", "attendance", mine)).toBe(false); // clock times are not editable
    for (const t of ["candidate", "payroll_run", "report", "audit_log", "policy", "setting", "backup"]) {
      expect(allowed("employee", "viewAny", t), t).toBe(false);
    }
  });

  it("own leave is editable only while it is open, and never self-approved", () => {
    expect(allowed("employee", "update", "leave_request", { ...mine, status: "draft" })).toBe(true);
    expect(allowed("employee", "update", "leave_request", { ...mine, status: "submitted" })).toBe(true);
    expect(allowed("employee", "update", "leave_request", { ...mine, status: "approved" })).toBe(false);
    expect(allowed("employee", "approve", "leave_request", { ...mine, status: "submitted" })).toBe(false);
    expect(allowed("hr_admin", "approve", "leave_request", { ...mine, status: "submitted" })).toBe(false);
  });

  it("everyone can read org units and leave types", () => {
    for (const role of ["employee", "recruiter", "auditor"]) {
      expect(allowed(role, "view", "org_unit")).toBe(true);
      expect(allowed(role, "viewAny", "leave_type")).toBe(true);
      expect(allowed(role, "create", "leave_type")).toBe(false);
      expect(allowed(role, "create", "org_unit")).toBe(false);
    }
  });
});

describe("hr_admin", () => {
  it("manages people data", () => {
    for (const t of ["employee", "org_unit", "leave_type", "candidate", "leave_request", "attendance"]) {
      for (const a of ["viewAny", "view", "create", "update", "export", "import"]) {
        expect(allowed("hr_admin", a, t, { status: "active" }), `${a} ${t}`).toBe(true);
      }
    }
    expect(allowed("hr_admin", "view", "report")).toBe(true);
    expect(allowed("hr_admin", "approve", "leave_request", { ...theirs, status: "submitted" })).toBe(true);
  });

  it("has no say over payroll", () => {
    expect(allowed("hr_admin", "viewAny", "payroll_run")).toBe(false);
    // everyone may list payslips (rows are narrowed to their own), but not read other people's
    expect(allowed("hr_admin", "view", "payslip", { ...theirs, status: "published" })).toBe(false);
    expect(allowed("hr_admin", "export", "payslip", { status: "published" })).toBe(false);
  });

  it("deletes only employees who have left", () => {
    expect(allowed("hr_admin", "delete", "employee", { status: "active" })).toBe(false);
    expect(allowed("hr_admin", "delete", "employee", { status: "on_leave" })).toBe(false);
    expect(allowed("hr_admin", "delete", "employee", { status: "terminated" })).toBe(true);
  });

  it("stays inside their own company", () => {
    expect(allowed("hr_admin", "view", "employee", { status: "active" }, "t2")).toBe(false);
  });
});

describe("hr_manager", () => {
  it("looks after employees and processes requests", () => {
    for (const a of ["view", "create", "update", "export"]) expect(allowed("hr_manager", a, "employee", { status: "active" })).toBe(true);
    expect(allowed("hr_manager", "delete", "employee", { status: "terminated" })).toBe(false);
    expect(allowed("hr_manager", "approve", "leave_request", { ...theirs, status: "submitted" })).toBe(true);
    expect(allowed("hr_manager", "reject", "attendance", theirs)).toBe(true);
    expect(allowed("hr_manager", "create", "leave_request", theirs)).toBe(true); // on someone's behalf
  });

  it("follows the pipeline but cannot touch payroll or edit candidates", () => {
    expect(allowed("hr_manager", "view", "candidate", { status: "interview" })).toBe(true);
    expect(allowed("hr_manager", "export", "candidate")).toBe(true);
    expect(allowed("hr_manager", "update", "candidate")).toBe(false);
    expect(allowed("hr_manager", "viewAny", "payroll_run")).toBe(false);
    expect(allowed("hr_manager", "view", "report")).toBe(true);
    expect(allowed("hr_manager", "export", "report")).toBe(true);
  });
});

describe("payroll_officer", () => {
  it("runs payroll through its steps", () => {
    for (const a of ["viewAny", "view", "create", "export", "import"]) expect(allowed("payroll_officer", a, "payroll_run", { status: "draft" }), a).toBe(true);
    expect(allowed("payroll_officer", "update", "payroll_run", { status: "draft" })).toBe(true); // generate
    expect(allowed("payroll_officer", "update", "payroll_run", { status: "generated" })).toBe(true);
    expect(allowed("payroll_officer", "lock", "payroll_run", { status: "generated" })).toBe(true);
    expect(allowed("payroll_officer", "publish", "payroll_run", { status: "locked" })).toBe(true);
  });

  it("cannot change a run once it is locked or published, nor delete it", () => {
    for (const status of ["locked", "published"]) {
      expect(allowed("payroll_officer", "update", "payroll_run", { status }), `update ${status}`).toBe(false);
      expect(allowed("payroll_officer", "delete", "payroll_run", { status }), `delete ${status}`).toBe(false);
    }
    expect(allowed("payroll_officer", "delete", "payroll_run", { status: "draft" })).toBe(true);
  });

  it("reads payslips but never edits them", () => {
    expect(allowed("payroll_officer", "view", "payslip", { status: "draft" })).toBe(true);
    expect(allowed("payroll_officer", "export", "payslip", { status: "published" })).toBe(true);
    for (const a of ["create", "update", "delete"]) expect(allowed("payroll_officer", a, "payslip", { status: "draft" }), a).toBe(false);
  });

  it("reads people, leave and attendance, but approves nothing", () => {
    expect(allowed("payroll_officer", "view", "employee", { status: "active" })).toBe(true);
    expect(allowed("payroll_officer", "update", "employee", { status: "active" })).toBe(false);
    expect(allowed("payroll_officer", "view", "leave_request", { ...theirs, status: "approved" })).toBe(true);
    expect(allowed("payroll_officer", "viewAny", "attendance")).toBe(true);
    expect(allowed("payroll_officer", "approve", "leave_request", { ...theirs, status: "submitted" })).toBe(false);
    expect(allowed("payroll_officer", "view", "report")).toBe(true);
  });
});

describe("line_manager", () => {
  it("sees and decides on their reports only", () => {
    expect(allowed("line_manager", "viewAny", "employee")).toBe(true);
    expect(allowed("line_manager", "view", "employee", myReport)).toBe(true);
    expect(allowed("line_manager", "view", "employee", theirs)).toBe(false);
    expect(allowed("line_manager", "approve", "leave_request", { ...myReport, status: "submitted" })).toBe(true);
    expect(allowed("line_manager", "reject", "leave_request", { ...myReport, status: "submitted" })).toBe(true);
    expect(allowed("line_manager", "approve", "attendance", myReport)).toBe(true);
    expect(allowed("line_manager", "approve", "leave_request", { ...theirs, status: "submitted" })).toBe(false);
    expect(allowed("line_manager", "approve", "leave_request", { ...mine, managerId: ME, status: "submitted" })).toBe(false); // never their own
  });

  it("has no access to pay or hiring", () => {
    for (const t of ["payroll_run", "candidate", "report"]) expect(allowed("line_manager", "viewAny", t), t).toBe(false);
    expect(allowed("line_manager", "update", "employee", myReport)).toBe(false);
  });
});

describe("recruiter", () => {
  it("manages candidates", () => {
    for (const a of ["viewAny", "view", "create", "update", "export"]) expect(allowed("recruiter", a, "candidate", { status: "screening" }), a).toBe(true);
    expect(allowed("recruiter", "delete", "candidate", { status: "rejected" })).toBe(false);
  });
  it("sees nothing else of the workforce", () => {
    expect(allowed("recruiter", "view", "employee", theirs)).toBe(false);
    expect(allowed("recruiter", "viewAny", "payroll_run")).toBe(false);
    expect(allowed("recruiter", "viewAny", "report")).toBe(false);
  });
});

describe("auditor", () => {
  it("reads HR and payroll evidence and the audit log, and changes nothing", () => {
    for (const t of ["employee", "leave_request", "attendance", "payroll_run", "payslip", "org_unit", "audit_log", "report"]) {
      expect(allowed("auditor", "view", t, { status: "published" }), `view ${t}`).toBe(true);
    }
    expect(allowed("auditor", "export", "audit_log")).toBe(true);
    expect(allowed("auditor", "export", "payslip", { status: "published" })).toBe(true);
    for (const t of ["employee", "leave_request", "attendance", "payroll_run", "payslip", "candidate", "audit_log"]) {
      for (const a of ["create", "update", "delete", "approve"]) expect(allowed("auditor", a, t, { status: "draft" }), `${a} ${t}`).toBe(false);
    }
    expect(allowed("auditor", "viewAny", "candidate")).toBe(false);
  });
});

describe("super_admin: everything, but the global rules still bind", () => {
  it("can do the ordinary things", () => {
    for (const t of HR_RESOURCES) expect(allowed("super_admin", "view", t, { status: "draft" }), t).toBe(true);
    expect(allowed("super_admin", "update", "payroll_run", { status: "draft" })).toBe(true);
    expect(allowed("super_admin", "create", "policy")).toBe(true);
    expect(allowed("super_admin", "create", "backup")).toBe(true);
  });

  it("is still stopped by the global denies", () => {
    expect(allowed("super_admin", "delete", "employee", { status: "active" })).toBe(false);
    expect(allowed("super_admin", "update", "payroll_run", { status: "published" })).toBe(false);
    expect(allowed("super_admin", "create", "payslip")).toBe(false);
    expect(allowed("super_admin", "approve", "leave_request", { ...mine, status: "submitted" })).toBe(false);
    expect(allowed("super_admin", "delete", "audit_log")).toBe(false);
  });

  it("may work across companies, unlike everyone else", () => {
    expect(allowed("super_admin", "view", "employee", { status: "active" }, "t2")).toBe(true);
    expect(allowed("hr_admin", "view", "employee", { status: "active" }, "t2")).toBe(false);
  });
});
