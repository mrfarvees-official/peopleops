export type AuditOutcome = "success" | "denied" | "failed";

export interface AuditEntry {
  tenantId?: string;
  actorId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  outcome?: AuditOutcome;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  reason?: string;
  requestId?: string;
  ip?: string;
}

const SKIPPED = /\.(view|viewAny)$/;

/** True for a successful view or list entry: the only kind the "log views" setting controls. */
export function isQuietViewEntry(entry: AuditEntry): boolean {
  return SKIPPED.test(entry.action) && entry.outcome !== "denied";
}

/**
 * Views and lists happen on every page load, so by default they are not
 * recorded (each one would be a database write). Denied attempts always are.
 * `logViews` comes from the audit.log_views setting.
 */
export function shouldAudit(entry: AuditEntry, logViews = false): boolean {
  return isQuietViewEntry(entry) ? logViews : true;
}

const SENSITIVE = new Set([
  "salary",
  "monthlySalary",
  "expectedSalary",
  "nationalId",
  "password",
  "passwordHash",
  "bankAccount",
]);

export function maskSensitive(
  data: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
    if (!data) return undefined;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
        if (SENSITIVE.has(k)) out[k] = "***";
        else if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
            out[k] = maskSensitive(v as Record<string, unknown>);
        } else out[k] = v;
    }
    return out;
}
