import { describe, expect, it } from "vitest";
import { createAudit } from "@/platform/application/audit-api";
import { InMemoryAuditWriter } from "@/platform/infrastructure/in-memory-audit-writer";

describe("audit api", () => {
  it("adds context and builds the action name", async () => {
    const w = new InMemoryAuditWriter();
    const audit = createAudit(w, { tenantId: "t1", actorId: "u1" });
    await audit.updated(
      { type: "employee", id: "e1" },
      { salary: 1 },
      { salary: 2 },
    );
    expect(w.entries[0]).toMatchObject({
      tenantId: "t1",
      actorId: "u1",
      action: "employee.update",
      resourceId: "e1",
      outcome: "success",
      after: { salary: "***" },
    });
  });

  it("records denied attempts with a reason", async () => {
    const w = new InMemoryAuditWriter();
    await createAudit(w).denied(
      "delete",
      { type: "employee", id: "e1" },
      "PBAC deny",
    );
    expect(w.entries[0]).toMatchObject({
      outcome: "denied",
      reason: "PBAC deny",
    });
  });
});
