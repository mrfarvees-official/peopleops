/**
 * Every setting the platform understands. Add a setting by adding an entry
 * here; the database only stores values that differ from the default.
 *
 * "flag" settings are 0 (off) or 1 (on).
 */
export type SettingType = "flag" | "integer" | "text";

export interface SettingDef {
  key: string;
  type: SettingType;
  default: number | string;
  group: string;
  label: string;
  description: string;
  min?: number; // integer only
  max?: number; // integer only
}

export const LOG_VIEWS_KEY = "audit.log_views";

export const SETTINGS: SettingDef[] = [
  {
    key: LOG_VIEWS_KEY,
    type: "flag",
    default: 0,
    group: "Audit",
    label: "Log views in the audit log",
    description:
      "1 records every view and list action in the audit log; 0 keeps them out. Each recorded view is a database write, so leave this off unless you need it. Denied attempts and all changes are always recorded.",
  },
  {
    key: "payroll.deduction_percent",
    type: "integer",
    default: 10,
    min: 0,
    max: 60,
    group: "Payroll",
    label: "Standard payroll deduction (%)",
    description:
      "Percentage taken from earned salary on every payslip (statutory contributions and tax, in one figure). Applies the next time a payroll run is generated.",
  },
];

export const findSetting = (key: string) => SETTINGS.find((s) => s.key === key);

export class UnknownSettingError extends Error {
  constructor(key: string) {
    super(`Unknown setting: ${key}`);
    this.name = "UnknownSettingError";
  }
}

export class InvalidSettingValueError extends Error {
  constructor(key: string, why: string) {
    super(`Invalid value for ${key}: ${why}`);
    this.name = "InvalidSettingValueError";
  }
}

/** Checks a raw API or database value against the setting type and returns the clean value. */
export function parseSettingValue(
  def: SettingDef,
  raw: unknown,
): number | string {
  switch (def.type) {
    case "flag": {
      const v = raw === true ? 1 : raw === false ? 0 : raw;
      if (v === 0 || v === "0") return 0;
      if (v === 1 || v === "1") return 1;
      throw new InvalidSettingValueError(def.key, "expected 0 or 1");
    }
    case "integer": {
      const n =
        typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
      if (typeof n !== "number" || !Number.isInteger(n)) {
        throw new InvalidSettingValueError(def.key, "expected a whole number");
      }
      if (def.min !== undefined && n < def.min) {
        throw new InvalidSettingValueError(def.key, `minimum is ${def.min}`);
      }
      if (def.max !== undefined && n > def.max) {
        throw new InvalidSettingValueError(def.key, `maximum is ${def.max}`);
      }
      return n;
    }
    case "text":
      if (typeof raw !== "string" || raw.length > 255) {
        throw new InvalidSettingValueError(
          def.key,
          "expected text up to 255 characters",
        );
      }
      return raw;
  }
}
