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

export function shouldAudit(entry: AuditEntry): boolean {
  if (!SKIPPED.test(entry.action)) return true;
  return entry.outcome === "denied";
}

const SENSITIVE = new Set([
  "salary",
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
