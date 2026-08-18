import type { ReceiptExtraction } from "./schema.js";

export function isNothingFound(extraction: Pick<ReceiptExtraction, "vendor" | "purchaseDate" | "total">): boolean {
  return extraction.vendor === null && extraction.purchaseDate === null && extraction.total === null;
}
