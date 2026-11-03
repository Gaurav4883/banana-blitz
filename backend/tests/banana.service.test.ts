import { afterEach, describe, expect, it, vi } from "vitest";
import { BananaService } from "../src/modules/banana/banana.service";

describe("BananaService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockBananaApi(solution = 8) {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          question: "https://www.sanfoh.com/uob/banana/data/test-puzzle.png",
          solution,
        }),
    });

    vi.stubGlobal("fetch", mockFetch);

    return mockFetch;
  }

  it("should generate a puzzle successfully", async () => {
    mockBananaApi();

    const service = new BananaService();

    const puzzle = await service.generatePuzzle();

    expect(puzzle.puzzleId).toBeDefined();

    expect(puzzle.question).toBe(
      "https://www.sanfoh.com/uob/banana/data/test-puzzle.png",
    );

    // The correct answer must never be exposed.
    expect(puzzle).not.toHaveProperty("solution");
  });

  it("should accept a correct answer", async () => {
    mockBananaApi(8);

    const service = new BananaService();

    const puzzle = await service.generatePuzzle();

    const result = service.submitAnswer(puzzle.puzzleId, 8);

    expect(result.correct).toBe(true);
    expect(result.message).toBe("Correct answer! Well done.");
    expect(result.remainingAttempts).toBe(9);
  });

  it("should reject an incorrect answer", async () => {
    mockBananaApi(8);

    const service = new BananaService();

    const puzzle = await service.generatePuzzle();

    const result = service.submitAnswer(puzzle.puzzleId, 5);

    expect(result.correct).toBe(false);
    expect(result.message).toBe("Incorrect answer. Try again!");
    expect(result.remainingAttempts).toBe(9);
  });

  it("should reject a puzzle that does not exist", () => {
    const service = new BananaService();

    expect(() => {
      service.submitAnswer("invalid-puzzle-id", 8);
    }).toThrow("Puzzle not found or already completed");
  });

  it("should handle an unsuccessful Banana API response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => "Service unavailable",
    });

    vi.stubGlobal("fetch", mockFetch);

    const service = new BananaService();

    await expect(service.generatePuzzle()).rejects.toThrow(
      "Banana API returned HTTP 503",
    );
  });

  it("should reject invalid JSON from the Banana API", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "This is not valid JSON",
    });

    vi.stubGlobal("fetch", mockFetch);

    const service = new BananaService();

    await expect(service.generatePuzzle()).rejects.toThrow(
      "Banana API returned invalid JSON",
    );
  });
});
