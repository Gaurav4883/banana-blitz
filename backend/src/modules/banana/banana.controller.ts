import { Request, Response } from "express";
import { bananaService } from "./banana.service";

export class BananaController {
  async generatePuzzle(_req: Request, res: Response): Promise<void> {
    try {
      const puzzle = await bananaService.generatePuzzle();

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

  // POST /api/v1/banana/answer check if answe is correct or not.
  submitAnswer(req: Request, res: Response): void {
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

      const result = bananaService.submitAnswer(puzzleId, answer);

      res.status(200).json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to submit answer";

      const statusCode =
        message.includes("not found") ||
        message.includes("expired") ||
        message.includes("Maximum attempts")
          ? 404
          : 400;

      res.status(statusCode).json({
        success: false,
        message,
      });
    }
  }
}

export const bananaController = new BananaController();
