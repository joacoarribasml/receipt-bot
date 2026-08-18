import { describe, it, expect } from "vitest";
import { isNothingFound } from "./isNothingFound.js";

describe("isNothingFound", () => {
  it("is true when vendor, date, and total are all null", () => {
    expect(isNothingFound({ vendor: null, purchaseDate: null, total: null })).toBe(true);
  });

  it("is false when only some fields are null", () => {
    expect(isNothingFound({ vendor: null, purchaseDate: null, total: 100 })).toBe(false);
  });

  it("is false when everything was extracted", () => {
    expect(isNothingFound({ vendor: "Carrefour", purchaseDate: "2026-08-10", total: 100 })).toBe(false);
  });
});
