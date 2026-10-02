// One default user per role. super_admin lives in the platform tenant, the rest in "demo".
export const USERS = [
  { role: "super_admin", tenant: "platform", first: "Sam", last: "Admin" },
  { role: "hr_admin", tenant: "demo", first: "Hana", last: "Perera" },
  { role: "hr_manager", tenant: "demo", first: "Mahesh", last: "Silva" },
  { role: "payroll_officer", tenant: "demo", first: "Priya", last: "Fernando" },
  { role: "line_manager", tenant: "demo", first: "Lakmal", last: "Jayasuriya" },
  { role: "recruiter", tenant: "demo", first: "Nimali", last: "Wickrama" },
  { role: "employee", tenant: "demo", first: "Kasun", last: "Bandara" },
  { role: "auditor", tenant: "demo", first: "Anya", last: "Rodrigo" },
] as const;
