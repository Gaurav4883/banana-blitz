import {
  Difficulty,
  GameSessionStatus,
  Prisma,
  PuzzleStatus,
} from "@prisma/client";
import { prisma } from "../../config/prisma";
import { bananaApiService } from "../banana/banana.service";

const MAX_TRANSACTION_RETRIES = 3;

// AI-assisted (Claude, Anthropic): race mode rules below, reviewed by me.

// The Banana API has no difficulty setting (checked the docs) so difficulty
// is our own rules: harder = less time, fewer guesses, more points.
export const DIFFICULTY_SETTINGS: Record<
  Difficulty,
  { timeLimitMs: number; maxAttempts: number; points: number }
> = {
  EASY: { timeLimitMs: 5 * 60 * 1000, maxAttempts: 10, points: 100 },
  MEDIUM: { timeLimitMs: 3 * 60 * 1000, maxAttempts: 5, points: 200 },
  HARD: { timeLimitMs: 90 * 1000, maxAttempts: 3, points: 400 },
};

// Race mode: a game is this many puzzles, then the highest score wins.
const PUZZLES_PER_GAME = 5;

// Solve within 30s for a speed bonus of up to +50%, going down to 0 at 30s.
const SPEED_BONUS_WINDOW_MS = 30 * 1000;
const MAX_SPEED_BONUS = 0.5;

export function calculatePoints(basePoints: number, elapsedMs: number) {
  const timeLeft = Math.max(0, SPEED_BONUS_WINDOW_MS - Math.max(0, elapsedMs));
  const bonus = Math.round(
    basePoints * MAX_SPEED_BONUS * (timeLeft / SPEED_BONUS_WINDOW_MS),
  );

  return { base: basePoints, bonus, total: basePoints + bonus };
}

const sessionSelect = {
  id: true,
  status: true,
  difficulty: true,
  puzzlesPerGame: true,
  score: true,
  totalPuzzles: true,
  solvedPuzzles: true,
  startedAt: true,
  completedAt: true,
} as const;

const puzzleSelect = {
  id: true,
  questionUrl: true,
  status: true,
  maxAttempts: true,
  attemptsUsed: true,
  expiresAt: true,
  createdAt: true,
  // Never select the solution for a client-facing response.
} as const;

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

  /**
   * Throws NOT_A_PLAYER unless the user has joined this session.
   * Stops someone who only knows (or guesses) a session ID from reading or
   * answering in it without joining. Works with either prisma or a tx.
   */
  async assertPlayer(
    sessionId: string,
    userId: string,
    db: Prisma.TransactionClient = prisma,
  ) {
    const player = await db.sessionPlayer.findUnique({
      where: { gameSessionId_userId: { gameSessionId: sessionId, userId } },
      select: { id: true },
    });

    if (!player) {
      throw new Error("NOT_A_PLAYER");
    }
  }

  /** Players in a session, best score first. Used for the side panel list. */
  async getPlayers(sessionId: string) {
    const players = await prisma.sessionPlayer.findMany({
      where: { gameSessionId: sessionId },
      orderBy: [{ score: "desc" }, { joinedAt: "asc" }],
      select: {
        userId: true,
        score: true,
        solvedCount: true,
        joinedAt: true,
        user: { select: { displayName: true, isGuest: true } },
      },
    });

    return players.map(({ user, ...player }) => ({
      ...player,
      displayName: user.displayName,
      isGuest: user.isGuest,
    }));
  }

  /**
   * Join an active session as a player. Calling it twice is fine,
   * upsert + the unique (session, user) index means no duplicate rows.
   */
  async joinSession(sessionId: string, userId: string) {
    const session = await prisma.gameSession.findUnique({
      where: { id: sessionId },
      select: { status: true },
    });

    if (!session) {
      throw new Error("GAME_SESSION_NOT_FOUND");
    }

    if (session.status !== GameSessionStatus.ACTIVE) {
      throw new Error("GAME_SESSION_NOT_ACTIVE");
    }

    await prisma.sessionPlayer.upsert({
      where: { gameSessionId_userId: { gameSessionId: sessionId, userId } },
      create: { gameSessionId: sessionId, userId },
      update: {},
    });

    return this.getSession(sessionId, userId);
  }

  async createSession(userId: string, difficulty: unknown = "MEDIUM") {
    if (
      typeof difficulty !== "string" ||
      !Object.values(Difficulty).includes(difficulty as Difficulty)
    ) {
      throw new Error("INVALID_DIFFICULTY");
    }

    return prisma.gameSession.create({
      data: {
        status: GameSessionStatus.ACTIVE,
        difficulty: difficulty as Difficulty,
        puzzlesPerGame: PUZZLES_PER_GAME,
        // the player who created the game (host)
        userId,
        // and the host is also the first player
        players: { create: { userId } },
      },
      select: sessionSelect,
    });
  }

  /**
   * Race mode: once the last puzzle of the game is over (solved, failed,
   * skipped or expired) the session is marked COMPLETED. Runs inside the
   * same transaction that ended the puzzle so it can't happen twice.
   */
  private async finishIfLastPuzzle(
    tx: Prisma.TransactionClient,
    sessionId: string,
  ): Promise<boolean> {
    const session = await tx.gameSession.findUnique({
      where: { id: sessionId },
      select: { status: true, totalPuzzles: true, puzzlesPerGame: true },
    });

    if (
      !session ||
      session.status !== GameSessionStatus.ACTIVE ||
      session.totalPuzzles < session.puzzlesPerGame
    ) {
      return false;
    }

    await tx.gameSession.update({
      where: { id: sessionId },
      data: { status: GameSessionStatus.COMPLETED, completedAt: new Date() },
    });

    return true;
  }

  /**
   * Checks the session is playable, marks old puzzles EXPIRED and returns
   * the current active puzzle if there is one. Used twice by createPuzzle.
   */
  private async loadActivePuzzle(
    tx: Prisma.TransactionClient,
    sessionId: string,
  ) {
    const session = await tx.gameSession.findUnique({
      where: { id: sessionId },
      select: {
        status: true,
        difficulty: true,
        totalPuzzles: true,
        puzzlesPerGame: true,
      },
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
      data: { status: PuzzleStatus.EXPIRED },
    });

    const active = await tx.puzzle.findFirst({
      where: {
        gameSessionId: sessionId,
        status: PuzzleStatus.ACTIVE,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: "desc" },
      select: puzzleSelect,
    });

    return { session, active };
  }

  async createPuzzle(sessionId: string, userId: string) {
    await this.assertPlayer(sessionId, userId);

    /*
     * First check whether a usable active puzzle already exists.
     * If every puzzle of the game has been used (the last one just
     * expired) the game is over instead.
     */
    const existing = await this.runSerializableTransaction(async (tx) => {
      const { session, active } = await this.loadActivePuzzle(tx, sessionId);

      if (active) return active;

      if (session.totalPuzzles >= session.puzzlesPerGame) {
        await this.finishIfLastPuzzle(tx, sessionId);
        return "FINISHED" as const;
      }

      return null;
    });

    // thrown after the transaction so the COMPLETED status is saved
    if (existing === "FINISHED") throw new Error("GAME_FINISHED");
    if (existing) return existing;

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
    const created = await this.runSerializableTransaction(async (tx) => {
      const { session, active } = await this.loadActivePuzzle(tx, sessionId);

      if (active) return active;

      if (session.totalPuzzles >= session.puzzlesPerGame) {
        await this.finishIfLastPuzzle(tx, sessionId);
        return "FINISHED" as const;
      }

      const settings = DIFFICULTY_SETTINGS[session.difficulty];

      const puzzle = await tx.puzzle.create({
        data: {
          gameSessionId: sessionId,
          questionUrl: puzzleData.question,
          solution: puzzleData.solution,
          // per player, not shared (race mode)
          maxAttempts: settings.maxAttempts,
          expiresAt: new Date(Date.now() + settings.timeLimitMs),
        },
        select: puzzleSelect,
      });

      await tx.gameSession.update({
        where: { id: sessionId },
        data: { totalPuzzles: { increment: 1 } },
      });

      return puzzle;
    });

    if (created === "FINISHED") throw new Error("GAME_FINISHED");

    return created;
  }

  /** How many guesses this player has used on this puzzle. */
  async countMyAttempts(puzzleId: string, userId: string) {
    return prisma.puzzleAttempt.count({ where: { puzzleId, userId } });
  }

  async submitAnswer(puzzleId: string, answer: number, userId: string) {
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

      // checked inside the transaction so it's the same snapshot as the rest
      await this.assertPlayer(puzzle.gameSessionId, userId, tx);

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
        return {
          expired: true as const,
          gameFinished: await this.finishIfLastPuzzle(tx, puzzle.gameSessionId),
        };
      }

      const session = await tx.gameSession.findUnique({
        where: { id: puzzle.gameSessionId },
        select: { status: true, difficulty: true },
      });

      if (!session) {
        throw new Error("GAME_SESSION_NOT_FOUND");
      }

      if (session.status !== GameSessionStatus.ACTIVE) {
        throw new Error("GAME_SESSION_NOT_ACTIVE");
      }

      // Race mode: every player gets their own guesses on each puzzle, so
      // one person guessing wrong doesn't use up everyone else's tries.
      const myAttempts = await tx.puzzleAttempt.count({
        where: { puzzleId, userId },
      });

      if (myAttempts >= puzzle.maxAttempts) {
        throw new Error("NO_ATTEMPTS_REMAINING");
      }

      const isCorrect = answer === puzzle.solution;
      // attemptNumber still counts all guesses on the puzzle (unique index)
      const attemptNumber = puzzle.attemptsUsed + 1;
      const myAttemptsUsed = myAttempts + 1;
      const attemptsRemaining = puzzle.maxAttempts - myAttemptsUsed;

      await tx.puzzleAttempt.create({
        data: {
          puzzleId,
          answer,
          isCorrect,
          attemptNumber,
          userId,
        },
      });

      if (isCorrect) {
        const points = calculatePoints(
          DIFFICULTY_SETTINGS[session.difficulty].points,
          now.getTime() - puzzle.createdAt.getTime(),
        );

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
            score: { increment: points.total },
            solvedPuzzles: { increment: 1 },
          },
        });

        /*
         * Only the player who solved it first gets the points (that's the
         * race). GameSession.score is just the total of everyone's points.
         * Same transaction so the two can't disagree.
         */
        await tx.sessionPlayer.update({
          where: {
            gameSessionId_userId: {
              gameSessionId: puzzle.gameSessionId,
              userId,
            },
          },
          data: {
            score: { increment: points.total },
            solvedCount: { increment: 1 },
          },
        });

        return {
          expired: false as const,
          correct: true,
          message: "Correct answer!",
          attemptsUsed: myAttemptsUsed,
          attemptsRemaining,
          pointsAwarded: points.total,
          speedBonus: points.bonus,
          puzzleStatus: PuzzleStatus.SOLVED,
          gameFinished: await this.finishIfLastPuzzle(tx, puzzle.gameSessionId),
        };
      }

      // The puzzle only fails once EVERY player has used all their guesses.
      const [playerCount, guessesPerPlayer] = await Promise.all([
        tx.sessionPlayer.count({
          where: { gameSessionId: puzzle.gameSessionId },
        }),
        tx.puzzleAttempt.groupBy({
          by: ["userId"],
          where: { puzzleId, userId: { not: null } },
          _count: { _all: true },
        }),
      ]);

      const playersOut = guessesPerPlayer.filter(
        (row) => row._count._all >= puzzle.maxAttempts,
      ).length;
      const everyoneOut = playersOut >= playerCount;

      await tx.puzzle.update({
        where: { id: puzzleId },
        data: {
          attemptsUsed: attemptNumber,
          status: everyoneOut ? PuzzleStatus.FAILED : PuzzleStatus.ACTIVE,
        },
      });

      return {
        expired: false as const,
        correct: false,
        message:
          attemptsRemaining > 0
            ? "Incorrect answer. Try again."
            : everyoneOut
              ? "No attempts remaining. This puzzle has ended."
              : "Out of guesses for this one. Waiting for the others...",
        attemptsUsed: myAttemptsUsed,
        attemptsRemaining,
        pointsAwarded: 0,
        speedBonus: 0,
        puzzleStatus: everyoneOut ? PuzzleStatus.FAILED : PuzzleStatus.ACTIVE,
        gameFinished: everyoneOut
          ? await this.finishIfLastPuzzle(tx, puzzle.gameSessionId)
          : false,
      };
    });

    if (result.expired) {
      throw new Error(result.gameFinished ? "GAME_FINISHED" : "PUZZLE_EXPIRED");
    }

    return result;
  }

  async skipPuzzle(puzzleId: string, userId: string) {
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

      await this.assertPlayer(puzzle.gameSessionId, userId, tx);

      if (puzzle.status !== PuzzleStatus.ACTIVE) {
        throw new Error("PUZZLE_NOT_ACTIVE");
      }

      const expired = new Date() >= puzzle.expiresAt;

      await tx.puzzle.update({
        where: { id: puzzleId },
        data: {
          status: expired ? PuzzleStatus.EXPIRED : PuzzleStatus.SKIPPED,
        },
      });

      return {
        expired,
        message: "Puzzle skipped",
        sessionId: puzzle.gameSessionId,
        gameFinished: await this.finishIfLastPuzzle(tx, puzzle.gameSessionId),
      };
    });

    if (result.expired) {
      throw new Error(result.gameFinished ? "GAME_FINISHED" : "PUZZLE_EXPIRED");
    }

    return result;
  }

  async getSession(sessionId: string, userId: string) {
    // 404 before 403, so a missing session isn't reported as "not a player"
    const exists = await prisma.gameSession.count({ where: { id: sessionId } });

    if (!exists) {
      throw new Error("GAME_SESSION_NOT_FOUND");
    }

    await this.assertPlayer(sessionId, userId);

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
        ...sessionSelect,
        puzzles: {
          orderBy: { createdAt: "desc" },
          select: {
            ...puzzleSelect,
            // how many guesses *this* player made (race mode, per player)
            _count: { select: { attempts: { where: { userId } } } },
          },
        },
      },
    });

    if (!session) {
      throw new Error("GAME_SESSION_NOT_FOUND");
    }

    return {
      ...session,
      puzzles: session.puzzles.map(({ _count, ...puzzle }) => ({
        ...puzzle,
        myAttemptsUsed: _count.attempts,
      })),
      players: await this.getPlayers(sessionId),
    };
  }
}

export const gameService = new GameService();
