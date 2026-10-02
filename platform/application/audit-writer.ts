import type { AuditEntry } from "../domain/audit";

export interface AuditWriter {
    record(entry: AuditEntry): Promise<void>;
}