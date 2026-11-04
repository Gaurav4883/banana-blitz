import { GameSessionStatus, PuzzleStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { bananaApiService } from "../banana/banana.service";

const PUZZLE_TIME_LIMIT_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const POINTS_PER_CORRECT_ANSWER = 100;

export class GameService {
  async getPuzzleSessionId(puzzleId: string): Promise<string> {
    const puzzle = await prisma.puzzle.findUnique({
      where: { id: puzzleId },
      select: { gameSessionId: true },
    });

    if (!puzzle) {
      throw new Error("PUZZLE_NOT_FOUND");
    }

    return puzzle.gameSessionId;
  }

  async createSession() {
    const session = await prisma.gameSession.create({
      data: {
        status: GameSessionStatus.ACTIVE,
      },
      select: {
        id: true,
        status: true,
        score: true,
        totalPuzzles: true,
        solvedPuzzles: true,
        startedAt: true,
      },
    });

    return session;
  }

  async createPuzzle(sessionId: string) {
    const session = await prisma.gameSession.findUnique({
      where: { id: sessionId },
      select: { id: true, status: true },
    });

    if (!session) {
      throw new Error("GAME_SESSION_NOT_FOUND");
    }

    if (session.status !== GameSessionStatus.ACTIVE) {
      throw new Error("GAME_SESSION_NOT_ACTIVE");
    }

    // Reuse the active puzzle if another player already generated it.
    const existingPuzzle = await prisma.puzzle.findFirst({
      where: {
        gameSessionId: sessionId,
        status: PuzzleStatus.ACTIVE,
      },
      select: {
        id: true,
        questionUrl: true,
        status: true,
        maxAttempts: true,
        attemptsUsed: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    if (existingPuzzle) {
      return existingPuzzle;
    }

    const puzzleData = await bananaApiService.fetchPuzzle();

    return prisma.$transaction(
      async (tx) => {
        // Check again inside the transaction to reduce duplicate creation.
        const activePuzzle = await tx.puzzle.findFirst({
          where: {
            gameSessionId: sessionId,
            status: PuzzleStatus.ACTIVE,
          },
          select: {
            id: true,
            questionUrl: true,
            status: true,
            maxAttempts: true,
            attemptsUsed: true,
            expiresAt: true,
            createdAt: true,
          },
        });

        if (activePuzzle) {
          return activePuzzle;
        }

        const puzzle = await tx.puzzle.create({
          data: {
            gameSessionId: sessionId,
            questionUrl: puzzleData.question,
            solution: puzzleData.solution,
            maxAttempts: MAX_ATTEMPTS,
            expiresAt: new Date(Date.now() + PUZZLE_TIME_LIMIT_MS),
          },
          select: {
            id: true,
            questionUrl: true,
            status: true,
            maxAttempts: true,
            attemptsUsed: true,
            expiresAt: true,
            createdAt: true,
          },
        });

        await tx.gameSession.update({
          where: { id: sessionId },
          data: { totalPuzzles: { increment: 1 } },
        });

        return puzzle;
      },
      {
        isolationLevel: "Serializable",
      },
    );
  }

  async submitAnswer(puzzleId: string, answer: number) {
    if (!Number.isFinite(answer)) {
      throw new Error("INVALID_ANSWER");
    }

    const result = await prisma.$transaction(
      async (tx) => {
        const puzzle = await tx.puzzle.findUnique({
          where: { id: puzzleId },
        });

        if (!puzzle) {
          throw new Error("PUZZLE_NOT_FOUND");
        }

        if (puzzle.status !== PuzzleStatus.ACTIVE) {
          throw new Error("PUZZLE_NOT_ACTIVE");
        }

        if (new Date() > puzzle.expiresAt) {
          await tx.puzzle.update({
            where: { id: puzzleId },
            data: { status: PuzzleStatus.EXPIRED },
          });

          // Return instead of throwing, so the update commits.
          return { expired: true as const };
        }

        if (puzzle.attemptsUsed >= puzzle.maxAttempts) {
          throw new Error("NO_ATTEMPTS_REMAINING");
        }

        const isCorrect = answer === puzzle.solution;
        const attemptNumber = puzzle.attemptsUsed + 1;
        const attemptsRemaining = puzzle.maxAttempts - attemptNumber;

        await tx.puzzleAttempt.create({
          data: {
            puzzleId,
            answer,
            isCorrect,
            attemptNumber,
          },
        });

        if (isCorrect) {
          await tx.puzzle.update({
            where: { id: puzzleId },
            data: {
              attemptsUsed: attemptNumber,
              status: PuzzleStatus.SOLVED,
              solvedAt: new Date(),
            },
          });

          await tx.gameSession.update({
            where: { id: puzzle.gameSessionId },
            data: {
              score: { increment: POINTS_PER_CORRECT_ANSWER },
              solvedPuzzles: { increment: 1 },
            },
          });

          return {
            expired: false as const,
            correct: true,
            message: "Correct answer!",
            attemptsUsed: attemptNumber,
            attemptsRemaining,
            pointsAwarded: POINTS_PER_CORRECT_ANSWER,
          };
        }

        const hasNoAttemptsLeft = attemptsRemaining <= 0;

        await tx.puzzle.update({
          where: { id: puzzleId },
          data: {
            attemptsUsed: attemptNumber,
            status: hasNoAttemptsLeft
              ? PuzzleStatus.FAILED
              : PuzzleStatus.ACTIVE,
          },
        });

        return {
          expired: false as const,
          correct: false,
          message: hasNoAttemptsLeft
            ? "No attempts remaining. This puzzle has ended."
            : "Incorrect answer. Try again.",
          attemptsUsed: attemptNumber,
          attemptsRemaining,
          pointsAwarded: 0,
        };
      },
      {
        isolationLevel: "Serializable",
      },
    );

    if (result.expired) {
      throw new Error("PUZZLE_EXPIRED");
    }

    return result;
  }

  async skipPuzzle(puzzleId: string) {
    const puzzle = await prisma.puzzle.findUnique({
      where: { id: puzzleId },
      select: {
        id: true,
        gameSessionId: true,
        status: true,
      },
    });

    if (!puzzle) {
      throw new Error("PUZZLE_NOT_FOUND");
    }

    if (puzzle.status !== PuzzleStatus.ACTIVE) {
      throw new Error("PUZZLE_NOT_ACTIVE");
    }

    await prisma.puzzle.update({
      where: { id: puzzleId },
      data: { status: PuzzleStatus.SKIPPED },
    });

    return {
      message: "Puzzle skipped",
      sessionId: puzzle.gameSessionId,
    };
  }

  async getSession(sessionId: string) {
    const session = await prisma.gameSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        status: true,
        score: true,
        totalPuzzles: true,
        solvedPuzzles: true,
        startedAt: true,
        completedAt: true,
        puzzles: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            questionUrl: true,
            status: true,
            attemptsUsed: true,
            maxAttempts: true,
            expiresAt: true,
            createdAt: true,
            // Never select the solution for a client-facing response.
          },
        },
      },
    });

    if (!session) {
      throw new Error("GAME_SESSION_NOT_FOUND");
    }

    return session;
  }
}

export const gameService = new GameService();
