import { maskSensitive, shouldAudit, type AuditEntry } from "../domain/audit";
import type { AuditWriter } from "../application/audit-writer";
import { after, before } from "node:test";

export interface AuditDb {
  auditLog: {
    create(args: { data: any }): Promise<unknown>;
  };
}

export class PrismaAuditWriter implements AuditWriter {
  constructor(private readonly db: AuditDb) {}

  async record(entry: AuditEntry): Promise<void> {
    if (!shouldAudit(entry)) return;
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
