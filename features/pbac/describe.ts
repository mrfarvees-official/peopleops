import type { Lookup, Lookups, PolicyView } from "./types";

const ATTRIBUTE_VALUES: Record<string, keyof Lookups> = {
  action: "actions",
  "subject.tenantId": "tenants",
  "resource.tenantId": "tenants",
  "subject.roles": "roles",
  "subject.id": "users",
  "resource.ownerId": "users",
  "resource.managerId": "users",
};

const name = (m: Lookup, key: string) => m[key] ?? key;

export const subjectText = (s: PolicyView["subjects"][number], l: Lookups) =>
  s.type === "any"
    ? "Everyone"
    : s.type === "role"
      ? `Role: ${name(l.roles, s.role ?? "")}`
      : `User: ${name(l.users, s.userId ?? "")}`;

export const targetText = (t: PolicyView["targets"][number], l: Lookups) =>
  `${t.action ? name(l.actions, t.action) : "Any action"} on ${
    t.resource ? name(l.resources, t.resource).toLowerCase() : "any resource"
  }`;

export function conditionText(c: PolicyView["conditions"][number], l: Lookups) {
  const attr = name(l.attributes, c.attribute);
  const op = name(l.operators, c.operator);
  if (c.operator === "exists") {
    return `${attr} ${c.value === false ? "is missing" : "is present"}`;
  }
  if (c.ref !== undefined) return `${attr} ${op} ${name(l.attributes, c.ref)}`;
  const source = ATTRIBUTE_VALUES[c.attribute];
  const show = (v: unknown) => (source ? name(l[source], String(v)) : String(v));
  const value = Array.isArray(c.value) ? c.value.map(show).join(", ") : show(c.value);
  return `${attr} ${op} ${value}`;
}

export const scopeText = (p: PolicyView, l: Lookups) =>
  p.tenantId === null ? "Global (every tenant)" : `Tenant: ${name(l.tenants, p.tenantId)}`;
