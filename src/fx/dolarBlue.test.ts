import { describe, it, expect } from "vitest";
import { convertArsToUsd, type BlueRate } from "./dolarBlue.js";

const fixedRate: BlueRate = { compra: 1500, venta: 1550, fechaActualizacion: "2026-08-17T00:00:00.000Z" };

describe("convertArsToUsd", () => {
  it("divides by the venta rate", () => {
    expect(convertArsToUsd(15500, fixedRate)).toBeCloseTo(10, 5);
  });

  it("handles zero", () => {
    expect(convertArsToUsd(0, fixedRate)).toBe(0);
  });
});
