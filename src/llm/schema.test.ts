import { describe, it, expect } from "vitest";
import { receiptExtractionSchema } from "./schema.js";

describe("receiptExtractionSchema", () => {
  it("accepts a fully populated valid extraction", () => {
    const result = receiptExtractionSchema.safeParse({
      vendor: "Carrefour",
      purchaseDate: "2026-08-10",
      currency: "ARS",
      total: 15230.5,
      confidence: "high",
    });
    expect(result.success).toBe(true);
  });

  it("accepts null for unreadable fields", () => {
    const result = receiptExtractionSchema.safeParse({
      vendor: null,
      purchaseDate: null,
      currency: null,
      total: null,
      confidence: "low",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a confidence value outside the enum", () => {
    const result = receiptExtractionSchema.safeParse({
      vendor: "Carrefour",
      purchaseDate: "2026-08-10",
      currency: "ARS",
      total: 100,
      confidence: "certain",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing required field", () => {
    const result = receiptExtractionSchema.safeParse({
      vendor: "Carrefour",
      purchaseDate: "2026-08-10",
      currency: "ARS",
      // total missing entirely
      confidence: "high",
    });
    expect(result.success).toBe(false);
  });

  it("rejects total as a string instead of a number", () => {
    const result = receiptExtractionSchema.safeParse({
      vendor: "Carrefour",
      purchaseDate: "2026-08-10",
      currency: "ARS",
      total: "15230.50",
      confidence: "high",
    });
    expect(result.success).toBe(false);
  });
});
