// AI-assisted (Claude, Anthropic): unit tests for the auth helpers.
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/modules/auth/password";
import { readSessionCookie } from "../src/modules/auth/auth.middleware";

describe("password hashing", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const stored = await hashPassword("banana123");

    expect(stored).not.toContain("banana123");
    expect(await verifyPassword("banana123", stored)).toBe(true);
    expect(await verifyPassword("banana124", stored)).toBe(false);
  });

  it("gives a different hash each time because of the random salt", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });

  it("returns false for a broken stored hash instead of throwing", async () => {
    expect(await verifyPassword("x", "nonsense")).toBe(false);
    expect(await verifyPassword("x", "abcd:12")).toBe(false);
  });
});

describe("readSessionCookie", () => {
  it("finds bb_session among other cookies", () => {
    expect(readSessionCookie("theme=dark; bb_session=abc.def; x=1")).toBe("abc.def");
  });

  it("returns undefined when the cookie is missing", () => {
    expect(readSessionCookie(undefined)).toBeUndefined();
    expect(readSessionCookie("theme=dark")).toBeUndefined();
  });
});
