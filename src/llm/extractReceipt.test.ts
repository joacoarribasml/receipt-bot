import { vi, describe, it, expect, beforeEach } from "vitest";

const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mockCreate };
  },
}));

const { extractReceipt } = await import("./extractReceipt.js");

const validInput = {
  vendor: "Carrefour",
  purchaseDate: "2026-08-10",
  currency: "ARS",
  total: 15230.5,
  confidence: "high",
};

function toolUseResponse(input: unknown) {
  return { content: [{ type: "tool_use", id: "toolu_1", name: "record_receipt", input }] };
}

describe("extractReceipt", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("returns validated data on a well-formed first response", async () => {
    mockCreate.mockResolvedValueOnce(toolUseResponse(validInput));

    const result = await extractReceipt({ imageBase64: "fake", mediaType: "image/jpeg" });

    expect(result.vendor).toBe("Carrefour");
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("retries once and succeeds when the first response fails schema validation", async () => {
    mockCreate
      .mockResolvedValueOnce(toolUseResponse({ ...validInput, confidence: "extremely-sure" }))
      .mockResolvedValueOnce(toolUseResponse(validInput));

    const result = await extractReceipt({ imageBase64: "fake", mediaType: "image/jpeg" });

    expect(result.confidence).toBe("high");
    expect(mockCreate).toHaveBeenCalledTimes(2);
    const secondCallArgs = mockCreate.mock.calls[1][0];
    const correctionText = secondCallArgs.messages[0].content[1].text;
    expect(correctionText).toMatch(/previous extraction did not match/);
  });

  it("throws if both attempts fail schema validation", async () => {
    mockCreate.mockResolvedValue(toolUseResponse({ ...validInput, confidence: "extremely-sure" }));

    await expect(extractReceipt({ imageBase64: "fake", mediaType: "image/jpeg" })).rejects.toThrow(
      /failed validation twice/,
    );
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("throws if the model never returns a tool_use block", async () => {
    mockCreate.mockResolvedValueOnce({ content: [{ type: "text", text: "I can't do that" }] });

    await expect(extractReceipt({ imageBase64: "fake", mediaType: "image/jpeg" })).rejects.toThrow(
      /did not return a tool_use block/,
    );
  });
});
