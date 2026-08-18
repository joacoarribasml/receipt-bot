import { describe, it, expect } from "vitest";
import { isAllowedUser } from "./accessControl.js";

describe("isAllowedUser", () => {
  const allowed = new Set(["111", "222"]);

  it("allows a user id in the allow-list", () => {
    expect(isAllowedUser("111", allowed)).toBe(true);
  });

  it("rejects a user id not in the allow-list", () => {
    expect(isAllowedUser("999", allowed)).toBe(false);
  });

  it("rejects an undefined user id", () => {
    expect(isAllowedUser(undefined, allowed)).toBe(false);
  });

  it("rejects everyone when the allow-list is empty", () => {
    expect(isAllowedUser("111", new Set())).toBe(false);
  });
});
