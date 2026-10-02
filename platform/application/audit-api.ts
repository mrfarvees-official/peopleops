import { act } from "react";
import { AuditEntry } from "../domain/audit";
import { AuditWriter } from "./audit-writer";

export interface AuditContext {
  tenantId?: string;
  actorId?: string;
  requestId?: string;
  ip?: string;
}

export interface AuditTarget {
  type: string;
  id?: string;
}

type Data = Record<string, unknown>;

export function createAudit(writer: AuditWriter, ctx: AuditContext = {}) {
  const write = (
    action: string,
    t: AuditTarget,
    extra: Partial<AuditEntry> = {},
  ) =>
    writer.record({
      ...ctx,
      action: `${t.type}.${action}`,
      resourceType: t.type,
      resourceId: t.id,
      ...extra,
    });

  return {
    created: (t: AuditTarget, after: Data) => write("create", t, { after }),
    updated: (t: AuditTarget, before: Data, after: Data) =>
      write("update", t, { before, after }),
    deleted: (t: AuditTarget, before: Data) => write("delete", t, { before }),
    restored: (t: AuditTarget, after: Data) => write("restore", t, { after }),
    transitioned: (t: AuditTarget, action: string, before: Data, after: Data) =>
      write(action, t, { before, after }),
    denied: (action: string, t: AuditTarget, reason: string) =>
      write(action, t, { outcome: "denied", reason }),
    failed: (action: string, t: AuditTarget, reason: string) =>
      write(action, t, { outcome: "failed", reason }),
  };
}

export type Audit = ReturnType<typeof createAudit>;