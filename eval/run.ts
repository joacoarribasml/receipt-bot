import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { extractReceipt } from "../src/llm/extractReceipt.js";
import { receiptExtractionSchema, type ReceiptExtraction } from "../src/llm/schema.js";

const FIXTURES_DIR = join(import.meta.dirname, "fixtures");
const FIELDS = ["vendor", "purchaseDate", "currency", "total"] as const;

function mediaTypeFor(file: string): "image/jpeg" | "image/png" | "image/webp" {
  const ext = extname(file).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

const APOSTROPHE_VARIANTS = /[´`''‘’]/g;

function normalizeString(s: string): string {
  return s.trim().toLowerCase().replace(APOSTROPHE_VARIANTS, "'").replace(/\s+/g, " ");
}

function scalarMatches(a: unknown, b: unknown): boolean {
  if (a === null || b === null) return a === b;
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 0.01;
  if (typeof a === "string" && typeof b === "string") return normalizeString(a) === normalizeString(b);
  return a === b;
}

async function main() {
  const imageFiles = readdirSync(FIXTURES_DIR).filter((f) => [".jpg", ".jpeg", ".png", ".webp"].includes(extname(f).toLowerCase()));

  if (imageFiles.length === 0) {
    console.log("No fixtures found in eval/fixtures/. See eval/fixtures/README.md.");
    return;
  }

  const fieldHits: Record<string, number> = Object.fromEntries(FIELDS.map((f) => [f, 0]));
  let totalLatencyMs = 0;
  let receiptCount = 0;
  const rows: string[] = [];

  for (const imageFile of imageFiles) {
    const base = imageFile.slice(0, imageFile.lastIndexOf("."));
    const groundTruthPath = join(FIXTURES_DIR, `${base}.json`);
    let groundTruth: ReceiptExtraction;
    try {
      groundTruth = receiptExtractionSchema.partial({ confidence: true }).parse(
        JSON.parse(readFileSync(groundTruthPath, "utf-8")),
      ) as ReceiptExtraction;
    } catch {
      console.warn(`Skipping ${imageFile}: no valid ${base}.json ground truth`);
      continue;
    }

    const imageBase64 = readFileSync(join(FIXTURES_DIR, imageFile)).toString("base64");
    const start = Date.now();
    const actual = await extractReceipt({ imageBase64, mediaType: mediaTypeFor(imageFile) });
    const latencyMs = Date.now() - start;
    totalLatencyMs += latencyMs;

    let hits = 0;
    const mismatches: string[] = [];
    for (const field of FIELDS) {
      if (scalarMatches(actual[field], groundTruth[field])) {
        fieldHits[field]++;
        hits++;
      } else {
        mismatches.push(`    ${field}: got ${JSON.stringify(actual[field])}, expected ${JSON.stringify(groundTruth[field])}`);
      }
    }

    receiptCount++;
    rows.push(`${imageFile.padEnd(20)} ${hits}/${FIELDS.length} fields  ${latencyMs}ms`);
    if (mismatches.length > 0) rows.push(mismatches.join("\n"));
  }

  const n = receiptCount;
  if (n === 0) {
    console.log("No fixtures with matching ground truth found.");
    return;
  }

  console.log(rows.join("\n"));
  console.log("\n--- Summary ---");
  for (const field of FIELDS) {
    console.log(`${field.padEnd(14)} ${((fieldHits[field] / n) * 100).toFixed(1)}%`);
  }
  console.log(`${"avg latency".padEnd(14)} ${(totalLatencyMs / n).toFixed(0)}ms`);
  console.log(`n = ${n} receipts`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
