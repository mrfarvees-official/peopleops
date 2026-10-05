import type { FieldDef, FieldOption } from "@/platform/domain/hr";

export interface Locale {
  timezone: string;
  currency: string;
}

export type Options = Partial<Record<string, FieldOption[]>>;

const date = (v: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${v}T00:00:00Z`));

/** Turns a stored value into text for people: names for options, dates, money, yes/no. */
export function formatValue(
  f: FieldDef,
  v: unknown,
  locale: Locale,
  options: Options = {},
): string {
  if (v === null || v === undefined || v === "") return "—";
  switch (f.type) {
    case "bool":
      return v ? "Yes" : "No";
    case "date":
      return date(String(v));
    case "datetime":
      return new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: locale.timezone,
      }).format(new Date(String(v)));
    case "money":
      return new Intl.NumberFormat("en", {
        style: "currency",
        currency: locale.currency,
      }).format(Number(v));
    case "number":
      return new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(
        Number(v),
      );
    case "select":
      return f.options?.find((o) => o.value === v)?.label ?? String(v);
    case "ref":
      return (
        (f.ref && options[f.ref]?.find((o) => o.value === v)?.label) || "—"
      );
    default:
      return String(v);
  }
}

export const money = (n: number, locale: Locale) =>
  new Intl.NumberFormat("en", {
    style: "currency",
    currency: locale.currency,
    maximumFractionDigits: 0,
  }).format(n);

export const clock = (iso: string | null, locale: Locale) =>
  iso
    ? new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: locale.timezone,
      }).format(new Date(iso))
    : "—";

/** Colour for a status-like value. */
export function tone(
  value: string,
): "good" | "info" | "warn" | "bad" | "muted" {
  if (
    [
      "approved",
      "active",
      "published",
      "hired",
      "present",
      "remote",
      "true",
    ].includes(value)
  )
    return "good";
  if (["submitted", "generated", "interview", "offer"].includes(value))
    return "info";
  if (["late", "locked", "on_leave", "screening", "half_day"].includes(value))
    return "warn";
  if (["rejected", "cancelled", "terminated", "absent"].includes(value))
    return "bad";
  return "muted";
}

export const toneClass = {
  good: "border-success text-success",
  info: "border-info text-info",
  warn: "border-warning text-warning",
  bad: "border-danger text-danger",
  muted: "text-muted",
} as const;

/** Fields whose values read as a status badge. */
export const isStatusField = (f: FieldDef) =>
  f.type === "select" && ["status", "stage"].includes(f.key);
