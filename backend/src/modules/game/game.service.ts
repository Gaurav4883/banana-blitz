import { GameSessionStatus, PuzzleStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { bananaService } from "../banana/banana.service";

const PUZZLE_EXPIRY_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

export class GameService {
  /**
   * Generate a puzzle and attach it to an existing game session.
   * If no session ID is supplied, create a guest game session.
   */
  async generatePuzzle(gameSessionId?: string) {
    let sessionId = gameSessionId;

    if (sessionId) {
      const session = await prisma.gameSession.findUnique({
        where: { id: sessionId },
      });

      if (!session || session.status !== GameSessionStatus.ACTIVE) {
        throw new Error("Active game session not found");
      }
    } else {
      const session = await prisma.gameSession.create({
        data: {},
      });

      sessionId = session.id;
    }

    // Mark any previous active puzzle in this session as skipped.
    await prisma.puzzle.updateMany({
      where: {
        gameSessionId: sessionId,
        status: PuzzleStatus.ACTIVE,
      },
      data: {
        status: PuzzleStatus.SKIPPED,
      },
    });

    // Get a new puzzle from the external Banana API.
    const bananaPuzzle = await bananaService.generatePuzzle();

    const puzzle = await prisma.$transaction(async (tx) => {
      const createdPuzzle = await tx.puzzle.create({
        data: {
          gameSessionId: sessionId!,
          questionUrl: bananaPuzzle.question,
          solution: bananaPuzzle.solution,
          maxAttempts: MAX_ATTEMPTS,
          expiresAt: new Date(Date.now() + PUZZLE_EXPIRY_MS),
        },
      });

      await tx.gameSession.update({
        where: { id: sessionId! },
        data: {
          totalPuzzles: { increment: 1 },
        },
      });

      return createdPuzzle;
    });

    // Never expose the solution.
    return {
      gameSessionId: sessionId,
      puzzleId: puzzle.id,
      question: puzzle.questionUrl,
    };
  }

  /**
   * Submit and record an answer.
   */
  async submitAnswer(puzzleId: string, answer: number) {
    return prisma.$transaction(async (tx) => {
      const puzzle = await tx.puzzle.findUnique({
        where: { id: puzzleId },
      });

      if (!puzzle) {
        throw new Error("Puzzle not found");
      }

      if (puzzle.status !== PuzzleStatus.ACTIVE) {
        throw new Error("Puzzle is no longer active");
      }

      if (puzzle.expiresAt.getTime() <= Date.now()) {
        await tx.puzzle.update({
          where: { id: puzzleId },
          data: { status: PuzzleStatus.EXPIRED },
        });

        throw new Error("Puzzle has expired. Generate a new one.");
      }

      if (puzzle.attemptsUsed >= puzzle.maxAttempts) {
        await tx.puzzle.update({
          where: { id: puzzleId },
          data: { status: PuzzleStatus.FAILED },
        });

        throw new Error("Maximum attempts reached. Generate a new puzzle.");
      }

      const attemptNumber = puzzle.attemptsUsed + 1;
      const correct = answer === puzzle.solution;
      const remainingAttempts = puzzle.maxAttempts - attemptNumber;

      await tx.puzzleAttempt.create({
        data: {
          puzzleId,
          answer,
          isCorrect: correct,
          attemptNumber,
        },
      });

      const updatedPuzzle = await tx.puzzle.update({
        where: { id: puzzleId },
        data: {
          attemptsUsed: attemptNumber,
          ...(correct
            ? {
                status: PuzzleStatus.SOLVED,
                solvedAt: new Date(),
              }
            : remainingAttempts === 0
              ? { status: PuzzleStatus.FAILED }
              : {}),
        },
      });

      if (correct) {
        await tx.gameSession.update({
          where: { id: puzzle.gameSessionId },
          data: {
            score: { increment: 100 },
            solvedPuzzles: { increment: 1 },
          },
        });
      }

      return {
        correct,
        message: correct
          ? "Correct answer! Well done."
          : remainingAttempts === 0
            ? "Incorrect answer. No attempts remaining."
            : "Incorrect answer. Try again!",
        remainingAttempts,
        attemptsUsed: updatedPuzzle.attemptsUsed,
      };
    });
  }

  /**
   * Retrieve a game session and its puzzle history.
   */
  async getGameSession(gameSessionId: string) {
    const session = await prisma.gameSession.findUnique({
      where: { id: gameSessionId },
      include: {
        puzzles: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            questionUrl: true,
            status: true,
            attemptsUsed: true,
            maxAttempts: true,
            createdAt: true,
            solvedAt: true,
            attempts: {
              orderBy: { attemptNumber: "asc" },
              select: {
                answer: true,
                isCorrect: true,
                attemptNumber: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    if (!session) {
      throw new Error("Game session not found");
    }

    return session;
  }
}

export const gameService = new GameService();
