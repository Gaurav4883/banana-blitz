import { GameSessionStatus, Prisma, PuzzleStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { bananaApiService } from "../banana/banana.service";

const PUZZLE_TIME_LIMIT_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const POINTS_PER_CORRECT_ANSWER = 100;
const MAX_TRANSACTION_RETRIES = 3;

export class GameService {
  /**
   * Runs a serializable transaction and retries Prisma serialization conflicts.
   *
   * Prisma error P2034 means the transaction failed because of a write
   * conflict or deadlock. Retrying the complete transaction is safe here
   * because the transaction callbacks contain database operations only.
   */
  private async runSerializableTransaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= MAX_TRANSACTION_RETRIES; attempt++) {
      try {
        return await prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const isSerializationConflict =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2034";

        if (!isSerializationConflict) {
          throw error;
        }

        if (attempt === MAX_TRANSACTION_RETRIES) {
          throw new Error("GAME_CONFLICT");
        }

        // Small increasing delay before retrying the transaction.
        await new Promise((resolve) => setTimeout(resolve, 40 * attempt));
      }
    }

    throw new Error("GAME_CONFLICT");
  }

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

  async createSession(userId: string) {
    return prisma.gameSession.create({
      data: {
        status: GameSessionStatus.ACTIVE,
        // the player who created the game (host)
        userId,
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
  }

  async createPuzzle(sessionId: string) {
    /*
     * First check whether a usable active puzzle already exists.
     * Expired ACTIVE puzzles are marked EXPIRED before checking.
     */
    const existingPuzzle = await this.runSerializableTransaction(async (tx) => {
      const session = await tx.gameSession.findUnique({
        where: { id: sessionId },
        select: { id: true, status: true },
      });

      if (!session) {
        throw new Error("GAME_SESSION_NOT_FOUND");
      }

      if (session.status !== GameSessionStatus.ACTIVE) {
        throw new Error("GAME_SESSION_NOT_ACTIVE");
      }

      const now = new Date();

      await tx.puzzle.updateMany({
        where: {
          gameSessionId: sessionId,
          status: PuzzleStatus.ACTIVE,
          expiresAt: { lte: now },
        },
        data: {
          status: PuzzleStatus.EXPIRED,
        },
      });

      return tx.puzzle.findFirst({
        where: {
          gameSessionId: sessionId,
          status: PuzzleStatus.ACTIVE,
          expiresAt: { gt: now },
        },
        orderBy: { createdAt: "desc" },
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
    });

    if (existingPuzzle) {
      return existingPuzzle;
    }

    /*
     * Fetch from the external Banana API outside the database transaction.
     * This avoids keeping a database transaction open during network I/O.
     */
    const puzzleData = await bananaApiService.fetchPuzzle();

    /*
     * Check again inside the creation transaction. Another player may
     * have created a puzzle while the Banana API request was running.
     *
     * If two transactions conflict, runSerializableTransaction retries.
     * The retry will find and reuse the puzzle created by the other player.
     */
    return this.runSerializableTransaction(async (tx) => {
      const session = await tx.gameSession.findUnique({
        where: { id: sessionId },
        select: { id: true, status: true },
      });

      if (!session) {
        throw new Error("GAME_SESSION_NOT_FOUND");
      }

      if (session.status !== GameSessionStatus.ACTIVE) {
        throw new Error("GAME_SESSION_NOT_ACTIVE");
      }

      const now = new Date();

      await tx.puzzle.updateMany({
        where: {
          gameSessionId: sessionId,
          status: PuzzleStatus.ACTIVE,
          expiresAt: { lte: now },
        },
        data: {
          status: PuzzleStatus.EXPIRED,
        },
      });

      const activePuzzle = await tx.puzzle.findFirst({
        where: {
          gameSessionId: sessionId,
          status: PuzzleStatus.ACTIVE,
          expiresAt: { gt: now },
        },
        orderBy: { createdAt: "desc" },
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
        data: {
          totalPuzzles: { increment: 1 },
        },
      });

      return puzzle;
    });
  }

  async submitAnswer(puzzleId: string, answer: number) {
    if (!Number.isFinite(answer)) {
      throw new Error("INVALID_ANSWER");
    }

    const result = await this.runSerializableTransaction(async (tx) => {
      const puzzle = await tx.puzzle.findUnique({
        where: { id: puzzleId },
      });

      if (!puzzle) {
        throw new Error("PUZZLE_NOT_FOUND");
      }

      if (puzzle.status !== PuzzleStatus.ACTIVE) {
        throw new Error("PUZZLE_NOT_ACTIVE");
      }

      const now = new Date();

      if (now >= puzzle.expiresAt) {
        await tx.puzzle.update({
          where: { id: puzzleId },
          data: { status: PuzzleStatus.EXPIRED },
        });

        // Return so that the expiration update is committed.
        return { expired: true as const };
      }

      if (puzzle.attemptsUsed >= puzzle.maxAttempts) {
        throw new Error("NO_ATTEMPTS_REMAINING");
      }

      const session = await tx.gameSession.findUnique({
        where: { id: puzzle.gameSessionId },
        select: { status: true },
      });

      if (!session) {
        throw new Error("GAME_SESSION_NOT_FOUND");
      }

      if (session.status !== GameSessionStatus.ACTIVE) {
        throw new Error("GAME_SESSION_NOT_ACTIVE");
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
            solvedAt: now,
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
          status: hasNoAttemptsLeft ? PuzzleStatus.FAILED : PuzzleStatus.ACTIVE,
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
    });

    if (result.expired) {
      throw new Error("PUZZLE_EXPIRED");
    }

    return result;
  }

  async skipPuzzle(puzzleId: string) {
    const result = await this.runSerializableTransaction(async (tx) => {
      const puzzle = await tx.puzzle.findUnique({
        where: { id: puzzleId },
        select: {
          id: true,
          gameSessionId: true,
          status: true,
          expiresAt: true,
        },
      });

      if (!puzzle) {
        throw new Error("PUZZLE_NOT_FOUND");
      }

      if (puzzle.status !== PuzzleStatus.ACTIVE) {
        throw new Error("PUZZLE_NOT_ACTIVE");
      }

      if (new Date() >= puzzle.expiresAt) {
        await tx.puzzle.update({
          where: { id: puzzleId },
          data: { status: PuzzleStatus.EXPIRED },
        });

        return { expired: true as const };
      }

      await tx.puzzle.update({
        where: { id: puzzleId },
        data: { status: PuzzleStatus.SKIPPED },
      });

      return {
        expired: false as const,
        message: "Puzzle skipped",
        sessionId: puzzle.gameSessionId,
      };
    });

    if (result.expired) {
      throw new Error("PUZZLE_EXPIRED");
    }

    return result;
  }

  async getSession(sessionId: string) {
    // Ensure expired puzzles are not returned as ACTIVE in session history.
    await prisma.puzzle.updateMany({
      where: {
        gameSessionId: sessionId,
        status: PuzzleStatus.ACTIVE,
        expiresAt: { lte: new Date() },
      },
      data: {
        status: PuzzleStatus.EXPIRED,
      },
    });

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
