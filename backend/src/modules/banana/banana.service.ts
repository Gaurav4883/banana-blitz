import { randomUUID } from "crypto";
import { ActivePuzzle, BananaApiResponse, PublicPuzzle } from "./banana.types";

function getBananaApiUrl(): string {
  return (
    process.env.BANANA_API_URL ||
    "https://marcconrad.com/uob/banana/api.php?out=json"
  );
}

const PUZZLE_EXPIRY_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

// Temporary in-memory puzzle storage.
// The solution must never be sent to the frontend.
const activePuzzles = new Map<string, ActivePuzzle>();

export class BananaService {
  // Request a new puzzle from the external Banana API.

  async generatePuzzle(): Promise<BananaApiResponse> {
    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 15000);

    try {
      const response = await fetch(getBananaApiUrl(), {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Banana API returned HTTP ${response.status}`);
      }

      const responseText = await response.text();

      let bananaData: BananaApiResponse;

      try {
        bananaData = JSON.parse(responseText) as BananaApiResponse;
      } catch {
        throw new Error("Banana API returned invalid JSON");
      }

      if (
        typeof bananaData.question !== "string" ||
        typeof bananaData.solution !== "number" ||
        !Number.isFinite(bananaData.solution)
      ) {
        throw new Error("Banana API returned an invalid puzzle");
      }

      const questionUrl = new URL(bananaData.question);

      if (questionUrl.protocol !== "https:") {
        throw new Error("Banana API returned an invalid image URL");
      }

      return {
        question: questionUrl.toString(),
        solution: bananaData.solution,
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Banana API request timed out");
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  // Validate a player's submitted answer.
  submitAnswer(
    puzzleId: string,
    answer: number,
  ): {
    correct: boolean;
    message: string;
    remainingAttempts: number;
  } {
    const puzzle = activePuzzles.get(puzzleId);

    if (!puzzle) {
      throw new Error("Puzzle not found or already completed");
    }

    if (Date.now() > puzzle.expiresAt) {
      activePuzzles.delete(puzzleId);
      throw new Error("Puzzle has expired. Please generate a new one.");
    }

    if (puzzle.attempts >= MAX_ATTEMPTS) {
      activePuzzles.delete(puzzleId);
      throw new Error("Maximum attempts reached. Generate a new puzzle.");
    }

    puzzle.attempts += 1;

    const correct = answer === puzzle.solution;

    if (correct) {
      activePuzzles.delete(puzzleId);

      return {
        correct: true,
        message: "Correct answer! Well done.",
        remainingAttempts: MAX_ATTEMPTS - puzzle.attempts,
      };
    }

    const remainingAttempts = MAX_ATTEMPTS - puzzle.attempts;

    if (remainingAttempts === 0) {
      activePuzzles.delete(puzzleId);

      return {
        correct: false,
        message: "Incorrect answer. No attempts remaining.",
        remainingAttempts: 0,
      };
    }

    return {
      correct: false,
      message: "Incorrect answer. Try again!",
      remainingAttempts,
    };
  }
}

export const bananaService = new BananaService();
