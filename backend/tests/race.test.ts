// AI-assisted (Claude, Anthropic): race mode scoring tests.
import { describe, expect, it } from "vitest";
import {
  DIFFICULTY_SETTINGS,
  calculatePoints,
} from "../src/modules/game/game.service";

describe("calculatePoints (speed bonus)", () => {
  it("gives the full +50% for an instant answer", () => {
    expect(calculatePoints(200, 0)).toEqual({ base: 200, bonus: 100, total: 300 });
  });

  it("halves the bonus at 15 seconds", () => {
    expect(calculatePoints(200, 15_000).bonus).toBe(50);
  });

  it("gives no bonus after 30 seconds", () => {
    expect(calculatePoints(200, 45_000)).toEqual({ base: 200, bonus: 0, total: 200 });
  });

  it("doesn't give extra for a clock that's slightly off (negative time)", () => {
    expect(calculatePoints(100, -5000).bonus).toBe(50);
  });
});

describe("difficulty settings", () => {
  it("harder means less time, fewer guesses and more points", () => {
    const { EASY, MEDIUM, HARD } = DIFFICULTY_SETTINGS;
    expect(EASY.timeLimitMs).toBeGreaterThan(MEDIUM.timeLimitMs);
    expect(MEDIUM.timeLimitMs).toBeGreaterThan(HARD.timeLimitMs);
    expect(EASY.maxAttempts).toBeGreaterThan(HARD.maxAttempts);
    expect(HARD.points).toBeGreaterThan(EASY.points);
  });
});
