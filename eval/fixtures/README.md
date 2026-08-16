Drop labeled receipt photos here as pairs:

```
eval/fixtures/001.jpg
eval/fixtures/001.json
eval/fixtures/002.jpg
eval/fixtures/002.json
...
```

Each `.json` is the hand-verified ground truth, matching the shape of `ReceiptExtraction`
(see `src/llm/schema.ts`), e.g.:

```json
{
  "vendor": "Carrefour",
  "purchaseDate": "2026-08-10",
  "currency": "ARS",
  "total": 15230.5,
  "items": [
    { "name": "Leche", "quantity": 2, "unitPrice": 1200 }
  ]
}
```

Aim for 20-30 receipts covering: clear photos, blurry/angled photos, long itemized
receipts, handwritten receipts, and receipts in a currency other than ARS.
