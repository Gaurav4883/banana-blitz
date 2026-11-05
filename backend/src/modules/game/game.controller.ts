import { Request, Response } from "express";
import { gameService } from "./game.service";
import { emitToGameSession } from "../../socket/socket";

function sendError(res: Response, error: unknown) {
  const code = error instanceof Error ? error.message : "INTERNAL_ERROR";

  const knownErrors: Record<string, { status: number; message: string }> = {
    GAME_SESSION_NOT_FOUND: {
      status: 404,
      message: "Game session not found",
    },
    GAME_SESSION_NOT_ACTIVE: {
      status: 409,
      message: "This game session is not active",
    },
    PUZZLE_NOT_FOUND: {
      status: 404,
      message: "Puzzle not found",
    },
    PUZZLE_NOT_ACTIVE: {
      status: 409,
      message: "This puzzle is no longer active",
    },
    PUZZLE_EXPIRED: {
      status: 410,
      message: "This puzzle has expired",
    },
    NO_ATTEMPTS_REMAINING: {
      status: 409,
      message: "No attempts remaining",
    },
    INVALID_ANSWER: {
      status: 400,
      message: "Please submit a valid numeric answer",
    },
    GAME_CONFLICT: {
      status: 409,
      message: "The game was updated by another player. Please try again.",
    },
  };

  const known = knownErrors[code];

  if (known) {
    return res.status(known.status).json({
      success: false,
      message: known.message,
    });
  }

  console.error("Game API error:", error);

  return res.status(500).json({
    success: false,
    message: "An unexpected error occurred",
  });
}

export const gameController = {
  async createSession(req: Request, res: Response) {
    try {
      // requireAuth runs before this so req.user is always set here
      const session = await gameService.createSession(req.user!.id);

      return res.status(201).json({
        success: true,
        message: "Game session created",
        data: session,
      });
    } catch (error) {
      return sendError(res, error);
    }
  },

  async createPuzzle(req: Request, res: Response) {
    try {
      const { sessionId } = req.params;

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          message: "Session ID is required",
        });
      }

      const puzzle = await gameService.createPuzzle(sessionId);
      emitToGameSession(sessionId, "game:puzzle-updated", puzzle);

      return res.status(201).json({
        success: true,
        message: "Puzzle generated",
        data: puzzle,
      });
    } catch (error) {
      return sendError(res, error);
    }
  },

  async submitAnswer(req: Request, res: Response) {
    try {
      const { puzzleId } = req.params;
      const { answer } = req.body as { answer?: unknown };

      if (!puzzleId) {
        return res.status(400).json({
          success: false,
          message: "Puzzle ID is required",
        });
      }

      if (typeof answer !== "number" || !Number.isFinite(answer)) {
        return res.status(400).json({
          success: false,
          message: "Answer must be a valid number",
        });
      }

      const sessionId = await gameService.getPuzzleSessionId(puzzleId);
      const result = await gameService.submitAnswer(puzzleId, answer);
      const session = await gameService.getSession(sessionId);

      const puzzleStatus = result.correct
        ? "SOLVED"
        : result.attemptsRemaining === 0
          ? "FAILED"
          : "ACTIVE";

      const sharedUpdate = {
        puzzleId,
        result,
        puzzleStatus,
        session: {
          id: session.id,
          score: session.score,
          totalPuzzles: session.totalPuzzles,
          solvedPuzzles: session.solvedPuzzles,
        },
      };

      emitToGameSession(sessionId, "game:answer-updated", sharedUpdate);

      return res.status(200).json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (error) {
      return sendError(res, error);
    }
  },

  async skipPuzzle(req: Request, res: Response) {
    try {
      const { puzzleId } = req.params;

      if (!puzzleId) {
        return res.status(400).json({
          success: false,
          message: "Puzzle ID is required",
        });
      }

      const result = await gameService.skipPuzzle(puzzleId);

      emitToGameSession(result.sessionId, "game:puzzle-skipped", { puzzleId });

      return res.status(200).json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (error) {
      return sendError(res, error);
    }
  },

  async getSession(req: Request, res: Response) {
    try {
      const { sessionId } = req.params;

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          message: "Session ID is required",
        });
      }

      const session = await gameService.getSession(sessionId);

      return res.status(200).json({
        success: true,
        message: "Game session retrieved",
        data: session,
      });
    } catch (error) {
      return sendError(res, error);
    }
  },
};
