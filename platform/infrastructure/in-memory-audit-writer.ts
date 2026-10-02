import { maskSensitive, shouldAudit, type AuditEntry } from "../domain/audit";
import type { AuditWriter } from "../application/audit-writer";

export class InMemoryAuditWriter implements AuditWriter {
  readonly entries: AuditEntry[] = [];

  async record(entry: AuditEntry): Promise<void> {
    if (!shouldAudit(entry)) return;

    this.entries.push({
      ...entry,
      outcome: entry.outcome ?? "success",
      before: maskSensitive(entry.before),
      after: maskSensitive(entry.after),
    });
  }
}
