import { z } from "zod";
import { isDate, toDay, ymd, type FieldDef } from "../domain/hr";

/** A row as the repositories hand it over: real Dates and numbers. */
export type Rec = Record<string, unknown> & { id: string; tenantId: string };

const writable = (f: FieldDef) => !f.readOnly && !f.display;

function base(f: FieldDef): z.ZodType {
  switch (f.type) {
    case "text":
    case "textarea":
      return z.string().trim().max(f.max ?? (f.type === "textarea" ? 500 : 255));
    case "email":
      return z.string().trim().toLowerCase().email().max(255);
    case "phone":
      return z.string().trim().regex(/^[0-9+()\-\s]{5,32}$/, "not a valid phone number");
    case "number": {
      let n = z.coerce.number().finite();
      if (f.min !== undefined) n = n.min(f.min);
      if (f.max !== undefined) n = n.max(f.max);
      return n;
    }
    case "money":
      return z.coerce
        .number()
        .min(f.min ?? 0)
        .max(f.max ?? 9_999_999_999)
        .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, "at most 2 decimals");
    case "date":
      return z
        .string()
        .refine(isDate, "use the format YYYY-MM-DD")
        .transform(toDay);
    case "datetime":
      return z
        .string()
        .refine((v) => !isNaN(Date.parse(v)), "not a valid date and time")
        .transform((v) => new Date(v));
    case "bool":
      return z.union([z.boolean(), z.enum(["true", "false"]).transform((v) => v === "true")]);
    case "select": {
      const values = (f.options ?? []).map((o) => o.value);
      return z.enum(values as [string, ...string[]]);
    }
    case "ref":
      return z.string().uuid("pick one from the list");
  }
}

/** Empty strings count as "no value" for optional fields. */
function fieldSchema(f: FieldDef): z.ZodType {
  const s = base(f);
  return f.required
    ? z.preprocess((v) => (v === "" ? undefined : v), s)
    : z.preprocess((v) => (v === "" ? null : v), s.nullable().optional());
}

/**
 * Input schema for the fields a caller may set. "create" requires the required
 * fields; "update" accepts any subset. Unknown or system-managed keys are rejected.
 */
export function buildSchema(fields: FieldDef[], mode: "create" | "update") {
  const shape: Record<string, z.ZodType> = {};
  for (const f of fields.filter(writable)) {
    const s = fieldSchema(f);
    shape[f.key] = mode === "update" ? s.optional() : s;
  }
  return z.object(shape).strict();
}

const iso = (d: Date) => d.toISOString();

/** Repository row -> JSON-safe row for the API and UI. */
export function serialize(fields: FieldDef[], rec: Rec): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: rec.id,
    createdAt: rec.createdAt instanceof Date ? iso(rec.createdAt) : (rec.createdAt ?? null),
    updatedAt: rec.updatedAt instanceof Date ? iso(rec.updatedAt) : (rec.updatedAt ?? null),
    deletedAt: rec.deletedAt instanceof Date ? iso(rec.deletedAt) : null,
  };
  for (const f of fields) {
    const v = rec[f.key];
    if (v === undefined || v === null) out[f.key] = null;
    else if (v instanceof Date) out[f.key] = f.type === "date" ? ymd(v) : iso(v);
    else out[f.key] = v;
  }
  return out;
}

export function formatZodIssues(e: z.ZodError) {
  return e.issues.map((i) => ({
    field: i.path.join(".") || undefined,
    message:
      i.code === "unrecognized_keys"
        ? `unknown or read-only field: ${(i as unknown as { keys: string[] }).keys.join(", ")}`
        : i.message,
  }));
}
