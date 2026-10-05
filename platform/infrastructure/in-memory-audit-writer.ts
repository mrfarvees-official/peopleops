import {
  isQuietViewEntry,
  maskSensitive,
  shouldAudit,
  type AuditEntry,
} from "../domain/audit";
import type { AuditWriter } from "../application/audit-writer";

export class InMemoryAuditWriter implements AuditWriter {
  readonly entries: AuditEntry[] = [];

  constructor(
    private readonly logViews: () => Promise<boolean> | boolean = () => false,
  ) {}

  async record(entry: AuditEntry): Promise<void> {
    const views = isQuietViewEntry(entry) ? await this.logViews() : false;
    if (!shouldAudit(entry, views)) return;

    this.entries.push({
      ...entry,
      outcome: entry.outcome ?? "success",
      before: maskSensitive(entry.before),
      after: maskSensitive(entry.after),
    });
  }
}
