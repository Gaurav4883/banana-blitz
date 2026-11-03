import { Request, Response } from "express";
import { gameService } from "./game.service";

export class GameController {
  async getSession(req: Request, res: Response): Promise<void> {
    try {
      const session = await gameService.getGameSession(String(req.params.sessionId));

      res.status(200).json({
        success: true,
        data: session,
      });
    } catch (error) {
      res.status(404).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unable to retrieve game session",
      });
    }
  }
}

export const gameController = new GameController();
