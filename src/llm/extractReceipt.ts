import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { receiptExtractionSchema, type ReceiptExtraction } from "./schema.js";
import { logger } from "../logger.js";

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
      confidence: { type: "string", enum: ["high", "medium", "low"] },
    },
    required: ["vendor", "purchaseDate", "currency", "total", "confidence"],
  },
};

const SYSTEM_PROMPT = `You extract structured data from photos of retail receipts.
Focus on the purchase date and the final total (after tax/tip if shown). Also capture vendor
and currency if visible. If a field is illegible or absent, use null rather than guessing.
These receipts are from Argentina. Dates are printed DD/MM/YYYY (day before month), not
MM/DD/YYYY — e.g. "08/09" means September 8th, not August 9th. Always output purchaseDate
in ISO 8601 (YYYY-MM-DD) after converting from that format.
Set confidence to "low" if the image is blurry, cropped, or partially unreadable.
Always respond by calling the ${TOOL_NAME} tool exactly once.`;

export interface ExtractOptions {
  imageBase64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
}

export async function extractReceipt({ imageBase64, mediaType }: ExtractOptions): Promise<ReceiptExtraction> {
  const attempt = async (correction?: string, attemptNumber = 1): Promise<ReceiptExtraction> => {
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
      logger.error({ attemptNumber, content: message.content }, "Model did not return a tool_use block");
      throw new Error("Model did not return a tool_use block");
    }

    const parsed = receiptExtractionSchema.safeParse(toolUse.input);
    if (!parsed.success) {
      if (correction) {
        logger.error({ attemptNumber, rawOutput: toolUse.input, error: parsed.error.message }, "Extraction failed validation twice");
        throw new Error(`Extraction failed validation twice: ${parsed.error.message}`);
      }
      logger.warn({ attemptNumber, rawOutput: toolUse.input, error: parsed.error.message }, "Extraction failed validation, retrying");
      return attempt(
        `Your previous extraction did not match the expected schema (${parsed.error.message}). Try again, calling ${TOOL_NAME} with valid values.`,
        attemptNumber + 1,
      );
    }

    logger.info({ attemptNumber, confidence: parsed.data.confidence }, "Receipt extracted");
    logger.debug({ attemptNumber, extraction: parsed.data }, "Receipt extraction detail");
    return parsed.data;
  };

  return attempt();
}
