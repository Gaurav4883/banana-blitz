import { Request, Response } from "express";
import { gameService } from "../game/game.service";

export class BananaController {
  /**
   * GET /api/v1/banana/puzzle
   *
   * Optional query parameter:
   * gameSessionId
   */
  async generatePuzzle(req: Request, res: Response): Promise<void> {
    try {
      const gameSessionId =
        typeof req.query.gameSessionId === "string"
          ? req.query.gameSessionId
          : undefined;

      const puzzle = await gameService.generatePuzzle(gameSessionId);

      res.status(200).json({
        success: true,
        message: "Puzzle generated successfully",
        data: puzzle,
      });
    } catch (error) {
      console.error("Generate puzzle error:", error);

      res.status(502).json({
        success: false,
        message:
          error instanceof Error ? error.message : "Unable to generate puzzle",
      });
    }
  }

  /**
   * POST /api/v1/banana/answer
   */
  async submitAnswer(req: Request, res: Response): Promise<void> {
    try {
      const { puzzleId, answer } = req.body ?? {};

      if (typeof puzzleId !== "string" || puzzleId.trim().length === 0) {
        res.status(400).json({
          success: false,
          message: "A valid puzzleId is required",
        });
        return;
      }

      if (typeof answer !== "number" || !Number.isFinite(answer)) {
        res.status(400).json({
          success: false,
          message: "A valid numeric answer is required",
        });
        return;
      }

      const result = await gameService.submitAnswer(puzzleId, answer);

      res.status(200).json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to submit answer";

      const statusCode = message.includes("not found") ? 404 : 400;

      res.status(statusCode).json({
        success: false,
        message,
      });
    }
  }
}

export const bananaController = new BananaController();
