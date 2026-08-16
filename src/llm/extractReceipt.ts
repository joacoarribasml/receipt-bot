import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { receiptExtractionSchema, type ReceiptExtraction } from "./schema.js";

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

const TOOL_NAME = "record_receipt";

const RECEIPT_TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: "Record the structured fields extracted from a receipt photo.",
  input_schema: {
    type: "object",
    properties: {
      vendor: { type: ["string", "null"], description: "Store or merchant name" },
      purchaseDate: { type: ["string", "null"], description: "ISO 8601 date, e.g. 2026-08-16" },
      currency: { type: ["string", "null"], description: "ISO 4217 code, e.g. ARS, USD" },
      total: { type: ["number", "null"] },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            quantity: { type: ["number", "null"] },
            unitPrice: { type: ["number", "null"] },
          },
          required: ["name", "quantity", "unitPrice"],
        },
      },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
    },
    required: ["vendor", "purchaseDate", "currency", "total", "items", "confidence"],
  },
};

const SYSTEM_PROMPT = `You extract structured data from photos of retail receipts.
Read every line item you can make out. If a field is illegible or absent, use null rather than guessing.
Set confidence to "low" if the image is blurry, cropped, or partially unreadable.
Always respond by calling the ${TOOL_NAME} tool exactly once.`;

export interface ExtractOptions {
  imageBase64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
}

export async function extractReceipt({ imageBase64, mediaType }: ExtractOptions): Promise<ReceiptExtraction> {
  const attempt = async (correction?: string): Promise<ReceiptExtraction> => {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [RECEIPT_TOOL],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
            { type: "text", text: correction ?? "Extract the receipt fields from this photo." },
          ],
        },
      ],
    });

    const toolUse = message.content.find((block) => block.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new Error("Model did not return a tool_use block");
    }

    const parsed = receiptExtractionSchema.safeParse(toolUse.input);
    if (!parsed.success) {
      if (correction) {
        throw new Error(`Extraction failed validation twice: ${parsed.error.message}`);
      }
      return attempt(
        `Your previous extraction did not match the expected schema (${parsed.error.message}). Try again, calling ${TOOL_NAME} with valid values.`,
      );
    }

    return parsed.data;
  };

  return attempt();
}
