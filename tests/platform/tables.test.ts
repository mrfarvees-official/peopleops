import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CsvSyntaxError, parseCsv, stringifyCsv } from "@/platform/domain/csv";
import { EXCLUDED_TABLES, TABLES } from "@/platform/domain/table-catalogue";
import {
  fromWire,
  orderByDependencies,
  resolveScope,
  toWire,
  visibleColumns,
  type ColumnMeta,
  type TableDef,
  type TableMeta,
} from "@/platform/domain/tables";

const col = (type: ColumnMeta["type"], over: Partial<ColumnMeta> = {}): ColumnMeta => ({
  name: "c",
  type,
  nullable: false,
  optional: false,
  ...over,
});

describe("csv", () => {
  it("round-trips commas, quotes, newlines and JSON", () => {
    const rows = [
      { a: "plain", b: 'say "hi", ok', c: "line1\nline2", d: { x: 1 }, e: null },
    ];
    const text = stringifyCsv(["a", "b", "c", "d", "e"], rows);
    const { headers, rows: back } = parseCsv(text);
    expect(headers).toEqual(["a", "b", "c", "d", "e"]);
    expect(back[0]).toEqual(["plain", 'say "hi", ok', "line1\nline2", '{"x":1}', ""]);
  });

  it("accepts LF, CRLF, a BOM and blank lines", () => {
    const { headers, rows } = parseCsv("﻿a,b\n1,2\r\n\r\n3,4\n");
    expect(headers).toEqual(["a", "b"]);
    expect(rows).toEqual([["1", "2"], ["3", "4"]]);
  });

  it("rejects broken files", () => {
    expect(() => parseCsv('a\n"open')).toThrow(CsvSyntaxError);
    expect(() => parseCsv("a,b\n1")).toThrow(/Row 2 has 1 fields/);
    expect(() => parseCsv("")).toThrow(/empty/);
  });
});

describe("value mapping", () => {
  it("converts database values to JSON-safe ones", () => {
    expect(toWire(new Date("2026-10-05T10:00:00Z"), col("datetime"))).toBe("2026-10-05T10:00:00.000Z");
    expect(toWire(BigInt(12), col("bigint"))).toBe("12");
    expect(toWire(1, col("boolean"))).toBe(true);
    expect(toWire('{"a":1}', col("json"))).toEqual({ a: 1 });
    expect(toWire(null, col("int"))).toBeNull();
  });

  it("converts file values for the database and names the bad column", () => {
    expect(fromWire("5", col("int"), true)).toBe(5);
    expect(fromWire("true", col("boolean"), true)).toBe(1);
    expect(fromWire("2026-10-05", col("date"), true)).toEqual(new Date("2026-10-05T00:00:00Z"));
    expect(fromWire({ a: 1 }, col("json"))).toBe('{"a":1}');
    expect(fromWire('{"a": 1}', col("json"), true)).toBe('{"a":1}');
    expect(() => fromWire("x", col("int", { name: "age" }))).toThrow(/age: expected a whole number/);
    expect(() => fromWire("soon", col("datetime"))).toThrow(/ISO date/);
    expect(() => fromWire("{", col("json"), true)).toThrow(/valid JSON/);
  });

  it("treats empty CSV cells as no value, and enforces required columns", () => {
    expect(fromWire("", col("text", { nullable: true }), true)).toBeNull();
    expect(fromWire("", col("text", { optional: true }), true)).toBeNull();
    expect(() => fromWire("", col("text", { name: "name" }), true)).toThrow(/name: a value is required/);
    expect(() => fromWire(null, col("text", { name: "name" }))).toThrow(/required/);
  });
});

describe("scope and ordering", () => {
  const byKey = new Map(TABLES.map((t) => [t.key, t]));

  it("follows a child table up to the tenant column", () => {
    expect(resolveScope(byKey.get("policy-targets")!, byKey)).toEqual({
      kind: "via",
      column: "policyId",
      parentTable: "platform_policy",
      parentColumn: "id",
      parent: { kind: "tenant", column: "tenantId" },
    });
    expect(resolveScope(byKey.get("roles")!, byKey)).toEqual({ kind: "global" });
  });

  it("puts parent tables before children", () => {
    const meta = (name: string, references: string[]): TableMeta => ({
      name, columns: [], primaryKey: ["id"], references,
    });
    const def = (table: string): TableDef => ({
      key: table, table, label: table, resource: "x", scope: { kind: "global" },
      export: true, import: true, backup: true,
    });
    const items = [
      { def: def("child"), meta: meta("child", ["parent"]) },
      { def: def("parent"), meta: meta("parent", ["root"]) },
      { def: def("root"), meta: meta("root", []) },
      { def: def("self"), meta: meta("self", ["self"]) },
    ];
    expect(orderByDependencies(items).map((i) => i.def.table)).toEqual(["root", "parent", "child", "self"]);
  });

  it("keeps secrets out of user files but in backups", () => {
    const users = byKey.get("users")!;
    const meta: TableMeta = {
      name: "platform_user",
      primaryKey: ["id"],
      references: [],
      columns: [col("text", { name: "id" }), col("text", { name: "passwordHash" })],
    };
    expect(visibleColumns(users, meta, "user").map((c) => c.name)).toEqual(["id"]);
    expect(visibleColumns(users, meta, "backup").map((c) => c.name)).toEqual(["id", "passwordHash"]);
  });
});

describe("table catalogue", () => {
  it("covers every table in the Prisma schema (register it or exclude it with a reason)", () => {
    const dir = path.resolve("prisma/schema");
    const mapped = readdirSync(dir)
      .filter((f) => f.endsWith(".prisma"))
      .flatMap((f) => [...readFileSync(path.join(dir, f), "utf8").matchAll(/@@map\("([^"]+)"\)/g)].map((m) => m[1]));
    const known = new Set([...TABLES.map((t) => t.table), ...Object.keys(EXCLUDED_TABLES)]);
    const missing = mapped.filter((t) => !known.has(t));
    expect(missing, `Add these tables to platform/domain/table-catalogue.ts: ${missing.join(", ")}`).toEqual([]);
  });

  it("has unique keys, valid parents and no unknown tables", () => {
    const keys = TABLES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(TABLES.map((t) => t.table)).size).toBe(TABLES.length);
    for (const t of TABLES) {
      expect(t.key).toMatch(/^[a-z0-9-]+$/);
      if (t.scope.kind === "via") expect(keys).toContain(t.scope.parent);
      expect(() => resolveScope(t, new Map(TABLES.map((x) => [x.key, x])))).not.toThrow();
    }
  });

  it("never offers secrets for import", () => {
    for (const t of TABLES) if (t.hidden?.length) expect(t.import).toBe(false);
  });
});
