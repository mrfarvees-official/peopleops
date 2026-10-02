import { describe, expect, it } from "vitest";
import { InMemoryAuditWriter } from "@/platform/infrastructure/in-memory-audit-writer";

describe("audit", () => {
  it("logs writes and masks sensitive fields", async () => {
    const w = new InMemoryAuditWriter();
    await w.record({
      action: "employee.update",
      resourceType: "employee",
      before: { name: "A", salary: 100 },
      after: { name: "B", salary: 200 },
    });

    expect(w.entries[0]?.outcome).toBe("success");
    expect(w.entries[0]?.after).toEqual({ name: "B", salary: "***" });
  });

  it("skips views but keeps denied views", async () => {
    const w = new InMemoryAuditWriter();
    await w.record({ action: "employee.view", resourceType: "employee" });
    await w.record({ action: "employee.viewAny", resourceType: "employee" });
    await w.record({
      action: "employee.view",
      resourceType: "employee",
      outcome: "denied",
    });
    expect(w.entries).toHaveLength(1);
  });
});
