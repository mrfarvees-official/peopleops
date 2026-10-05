import type { PolicyView } from "./types";

export type SubjectDraft = {
  type: "any" | "role" | "user";
  role: string;
  userId: string;
};
export type TargetDraft = { action: string; resource: string }; // "" = any
export type ConditionDraft = {
  attribute: string;
  operator: string;
  mode: "value" | "ref";
  text: string; // literal typed by hand (or "true"/"false" for "is present")
  list: string[]; // literal chosen from a dropdown (one or many)
  ref: string; // attribute compared against, when mode = "ref"
};
export type Draft = {
  name: string;
  code: string;
  description: string;
  effect: "allow" | "deny";
  isActive: boolean;
  scope: string; // "" = this tenant, "global", or a tenant id (create only)
  subjects: SubjectDraft[];
  targets: TargetDraft[];
  conditions: ConditionDraft[];
};

export const emptySubject = (): SubjectDraft => ({ type: "role", role: "", userId: "" });
export const emptyTarget = (): TargetDraft => ({ action: "", resource: "" });
export const emptyCondition = (): ConditionDraft => ({
  attribute: "",
  operator: "eq",
  mode: "value",
  text: "",
  list: [],
  ref: "",
});

export const emptyDraft = (): Draft => ({
  name: "",
  code: "",
  description: "",
  effect: "allow",
  isActive: true,
  scope: "",
  subjects: [emptySubject()],
  targets: [emptyTarget()],
  conditions: [],
});

const asList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String) : v === undefined ? [] : [String(v)];

export function draftFromPolicy(p: PolicyView): Draft {
  return {
    name: p.name,
    code: p.code,
    description: p.description ?? "",
    effect: p.effect,
    isActive: p.isActive,
    scope: "",
    subjects: p.subjects.map((s) => ({
      type: s.type,
      role: s.role ?? "",
      userId: s.userId ?? "",
    })),
    targets: p.targets.map((t) => ({
      action: t.action ?? "",
      resource: t.resource ?? "",
    })),
    conditions: p.conditions.map((c) => ({
      attribute: c.attribute,
      operator: c.operator,
      mode: c.ref !== undefined ? "ref" : "value",
      text:
        c.operator === "exists"
          ? String(c.value === undefined ? true : c.value)
          : Array.isArray(c.value)
            ? c.value.join(", ")
            : c.value === undefined
              ? ""
              : String(c.value),
      list: asList(c.value),
      ref: c.ref ?? "",
    })),
  };
}

const NUMERIC_OPS = new Set(["gt", "gte", "lt", "lte"]);
const LIST_OPS = new Set(["in", "not_in"]);

function conditionValue(c: ConditionDraft, hasOptions: boolean): unknown {
  if (c.operator === "exists") return c.text !== "false";
  if (hasOptions) return LIST_OPS.has(c.operator) ? c.list : (c.list[0] ?? "");
  if (LIST_OPS.has(c.operator)) {
    return c.text.split(",").map((x) => x.trim()).filter(Boolean);
  }
  if (NUMERIC_OPS.has(c.operator) && c.text.trim() !== "" && !isNaN(Number(c.text))) {
    return Number(c.text);
  }
  return c.text;
}

/** Builds the API body. `optionsFor` says whether an attribute has a dropdown of values. */
export function toPayload(
  d: Draft,
  mode: "create" | "edit",
  optionsFor: (attribute: string) => boolean,
) {
  return {
    code: d.code,
    name: d.name,
    description: d.description || undefined,
    effect: d.effect,
    isActive: d.isActive,
    ...(mode === "create" && d.scope
      ? { tenantId: d.scope === "global" ? null : d.scope }
      : {}),
    subjects: d.subjects.map((s) =>
      s.type === "any"
        ? { type: "any" }
        : s.type === "role"
          ? { type: "role", role: s.role }
          : { type: "user", userId: s.userId },
    ),
    targets: d.targets.map((t) => ({
      action: t.action || null,
      resource: t.resource || null,
    })),
    conditions: d.conditions.map((c) =>
      c.mode === "ref" && c.operator !== "exists"
        ? { attribute: c.attribute, operator: c.operator, ref: c.ref }
        : {
            attribute: c.attribute,
            operator: c.operator,
            value: conditionValue(c, optionsFor(c.attribute) && c.operator !== "exists"),
          },
    ),
  };
}
