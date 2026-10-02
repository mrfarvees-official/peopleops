import { describe, expect, it } from "vitest";
import {
  hashPassword,
  verifyPassword,
} from "@/platform/infrastructure/scrypt-password-hasher";

describe("password hasher", () => {
  it("verifies the right password and rejects others", async () => {
    const h = await hashPassword("s3cret-pass");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("s3cret-pass", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });
});
