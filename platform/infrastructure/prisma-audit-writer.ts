import {
  isQuietViewEntry,
  maskSensitive,
  shouldAudit,
  type AuditEntry,
} from "../domain/audit";
import type { AuditWriter } from "../application/audit-writer";

export interface AuditDb {
  auditLog: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create(args: { data: any }): Promise<unknown>;
  };
}

export class PrismaAuditWriter implements AuditWriter {
  /**
   * `logViews` is read only for view/list entries, so ordinary writes never
   * pay for the lookup. Without it, views are never recorded.
   */
  constructor(
    private readonly db: AuditDb,
    private readonly logViews: () => Promise<boolean> | boolean = () => false,
  ) {}

  async record(entry: AuditEntry): Promise<void> {
    const views = isQuietViewEntry(entry) ? await this.logViews() : false;
    if (!shouldAudit(entry, views)) return;
    await this.db.auditLog.create({
      data: {
        ...entry,
        outcome: entry.outcome ?? "success",
        before: maskSensitive(entry.before),
        after: maskSensitive(entry.after),
      },
    });
  }
}
