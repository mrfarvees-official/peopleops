export type Effect = "allow" | "deny";

export const SYSTEM_DEVELOPER_ROLE = "system_developer";

export const isBypass = (s: { roles: string[] }) =>
  s.roles.includes(SYSTEM_DEVELOPER_ROLE);

export type Operator =
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

/** Dropdown entry: `value` is what the API stores, `label` is what people read. */
export interface Option {
  value: string;
  label: string;
  description?: string;
}

/** "viewAny" -> "View any", "leave_request" -> "Leave request" */
export function humanize(code: string): string {
  const words = code
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_.-]+/g, " ")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// Attributes policies may reference. Drives the condition dropdowns.
export const ATTRIBUTE_OPTIONS: Option[] = [
  { value: "action", label: "Action being performed" },
  { value: "subject.id", label: "User: ID" },
  { value: "subject.tenantId", label: "User: tenant" },
  { value: "subject.email", label: "User: email" },
  { value: "subject.displayName", label: "User: name" },
  { value: "subject.roles", label: "User: roles" },
  { value: "resource.id", label: "Record: ID" },
  { value: "resource.tenantId", label: "Record: tenant" },
  { value: "resource.ownerId", label: "Record: owner" },
  { value: "resource.managerId", label: "Record: owner's manager" },
  { value: "resource.status", label: "Record: status" },
  { value: "env.ip", label: "Request: IP address" },
  { value: "env.requestId", label: "Request: ID" },
];

export const OPERATOR_OPTIONS: Option[] = [
  { value: "eq", label: "equals" },
  { value: "neq", label: "does not equal" },
  { value: "in", label: "is one of" },
  { value: "not_in", label: "is not one of" },
  { value: "gt", label: "is greater than" },
  { value: "gte", label: "is at least" },
  { value: "lt", label: "is less than" },
  { value: "lte", label: "is at most" },
  { value: "contains", label: "contains" },
  { value: "exists", label: "is present" },
];

export interface PolicySubject {
  type: "any" | "role" | "user";
  role?: string; // role code
  userId?: string;
}

// null = any
export interface PolicyTarget {
  action: string | null;
  resource: string | null;
}

export interface PolicyCondition {
  attribute: string; // "subject.*" | "resource.*" | "env.*" | "action"
  operator: Operator;
  value?: unknown;
  ref?: string; // compare against another attribute instead of a literal
}

export interface Policy {
  id: string;
  code: string;
  effect: Effect;
  subjects: PolicySubject[];
  targets: PolicyTarget[];
  conditions: PolicyCondition[];
}

export interface AuthzContext {
  requestId?: string;
  ip?: string;
  env?: Record<string, unknown>;
}

export interface AuthzSubject {
  id: string;
  tenantId: string;
  roles: string[];
  [attr: string]: unknown;
}

export interface AuthzResource {
  type: string;
  id?: string;
  tenantId?: string;
  [attr: string]: unknown;
}

export interface AuthzRequest {
  subject: AuthzSubject;
  action: string;
  resource: AuthzResource;
  env?: Record<string, unknown>;
}

export interface Decision {
  allowed: boolean;
  reason: "allowed" | "explicit_deny" | "no_matching_policy" | "bypass";
  matched: string[];
}

export class ForbiddenError extends Error {
  constructor(readonly decision: Decision) {
    super("Forbidden");
    this.name = "ForbiddenError";
  }
}

function resolve(ctx: Record<string, unknown>, path: string): unknown {
  let cur: unknown = ctx;
  for (const key of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function order(a: unknown, b: unknown): number | null {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "string" && typeof b === "string")
    return a < b ? -1 : a > b ? 1 : 0;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  return null;
}

function holds(c: PolicyCondition, ctx: Record<string, unknown>): boolean {
  const actual = resolve(ctx, c.attribute);
  const present = actual !== undefined && actual !== null;

  if (c.operator === "exists") {
    const want = c.value === undefined ? true : Boolean(c.value);
    return present === want;
  }

  // Fail closed: a missing attribute or operand never satisfies a condition.
  if (!present) return false;
  const expected = c.ref !== undefined ? resolve(ctx, c.ref) : c.value;
  if (expected === undefined || expected === null) return false;

  switch (c.operator) {
    case "eq":
      return actual === expected;
    case "neq":
      return actual !== expected;
    case "in":
      return Array.isArray(expected) && expected.includes(actual);
    case "not_in":
      return Array.isArray(expected) && !expected.includes(actual);
    case "gt": {
      const d = order(actual, expected);
      return d !== null && d > 0;
    }
    case "gte": {
      const d = order(actual, expected);
      return d !== null && d >= 0;
    }
    case "lt": {
      const d = order(actual, expected);
      return d !== null && d < 0;
    }
    case "lte": {
      const d = order(actual, expected);
      return d !== null && d <= 0;
    }
    case "contains":
      if (Array.isArray(actual)) return actual.includes(expected);
      return (
        typeof actual === "string" &&
        typeof expected === "string" &&
        actual.includes(expected)
      );
    default:
      return false;
  }
}

const subjectMatches = (p: Policy, s: AuthzSubject) =>
  p.subjects.some(
    (x) =>
      x.type === "any" ||
      (x.type === "role" && x.role !== undefined && s.roles.includes(x.role)) ||
      (x.type === "user" && x.userId === s.id),
  );

const targetMatches = (p: Policy, action: string, resourceType: string) =>
  p.targets.some(
    (t) =>
      (t.action === null || t.action === action) &&
      (t.resource === null || t.resource === resourceType),
  );

// Default deny. Any matching deny wins. Otherwise one matching allow is enough.
export function evaluate(policies: Policy[], req: AuthzRequest): Decision {
  if (isBypass(req.subject)) {
    return { allowed: true, reason: "bypass", matched: [] };
  }

  const ctx = {
    subject: req.subject,
    resource: req.resource,
    action: req.action,
    env: req.env ?? {},
  };

  const matched = policies.filter(
    (p) =>
      subjectMatches(p, req.subject) &&
      targetMatches(p, req.action, req.resource.type) &&
      p.conditions.every((c) => holds(c, ctx)),
  );

  const codes = matched.map((p) => p.code);
  if (matched.some((p) => p.effect === "deny")) {
    return { allowed: false, reason: "explicit_deny", matched: codes };
  }
  if (matched.some((p) => p.effect === "allow")) {
    return { allowed: true, reason: "allowed", matched: codes };
  }
  return { allowed: false, reason: "no_matching_policy", matched: [] };
}
