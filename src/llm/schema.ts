import { z } from "zod";

export const receiptItemSchema = z.object({
  name: z.string(),
  quantity: z.number().nullable(),
  unitPrice: z.number().nullable(),
});

export const receiptExtractionSchema = z.object({
  vendor: z.string().nullable(),
  purchaseDate: z.string().nullable().describe("ISO 8601 date, e.g. 2026-08-16"),
  currency: z.string().nullable().describe("ISO 4217 code, e.g. ARS, USD"),
  total: z.number().nullable(),
  items: z.array(receiptItemSchema),
  confidence: z.enum(["high", "medium", "low"]).describe(
    "Your own confidence that the extraction is complete and correct",
  ),
});

export type ReceiptExtraction = z.infer<typeof receiptExtractionSchema>;
