// AI-assisted (Claude, Anthropic): updated for BananaApiService, reviewed by me.
// The old tests were for a BananaService class that kept puzzles in memory.
// That got replaced by the database version, so these test what the service
// does now: fetch + validate the external Banana API response.
import { afterEach, describe, expect, it, vi } from "vitest";
import { BananaApiService } from "../src/modules/banana/banana.service";

const IMAGE_URL = "https://www.sanfoh.com/uob/banana/data/test-puzzle.png";

// fake fetch so the tests don't hit the real API (fast + no network needed)
function mockBananaApi(body: string, status = 200) {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  });

  vi.stubGlobal("fetch", mockFetch);
  return mockFetch;
}

describe("BananaApiService.fetchPuzzle", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the question URL and solution", async () => {
    mockBananaApi(JSON.stringify({ question: IMAGE_URL, solution: 8 }));

    const puzzle = await new BananaApiService().fetchPuzzle();

    expect(puzzle).toEqual({ question: IMAGE_URL, solution: 8 });
  });

  it("asks for JSON from the configured URL", async () => {
    const mockFetch = mockBananaApi(
      JSON.stringify({ question: IMAGE_URL, solution: 3 }),
    );

    await new BananaApiService().fetchPuzzle();

    const [url, options] = mockFetch.mock.calls[0];
    expect(String(url)).toContain("out=json");
    expect(options.headers.Accept).toBe("application/json");
  });

  it("throws on a non-2xx response", async () => {
    mockBananaApi("Service unavailable", 503);

    await expect(new BananaApiService().fetchPuzzle()).rejects.toThrow(
      "Banana API returned HTTP 503",
    );
  });

  it("throws on invalid JSON", async () => {
    mockBananaApi("This is not valid JSON");

    await expect(new BananaApiService().fetchPuzzle()).rejects.toThrow(
      "Banana API returned invalid JSON",
    );
  });

  it("throws when fields are missing", async () => {
    mockBananaApi(JSON.stringify({ question: IMAGE_URL }));

    await expect(new BananaApiService().fetchPuzzle()).rejects.toThrow(
      "invalid structure",
    );
  });

  it("throws when the solution isn't a number", async () => {
    mockBananaApi(JSON.stringify({ question: IMAGE_URL, solution: "8" }));

    await expect(new BananaApiService().fetchPuzzle()).rejects.toThrow(
      "invalid puzzle data",
    );
  });

  it("refuses a plain http image (mixed content / tampering)", async () => {
    mockBananaApi(
      JSON.stringify({ question: "http://example.com/a.png", solution: 1 }),
    );

    await expect(new BananaApiService().fetchPuzzle()).rejects.toThrow(
      "non-HTTPS",
    );
  });
});
