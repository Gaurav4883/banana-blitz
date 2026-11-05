// AI-assisted (Claude, Anthropic): leaderboard + player stats routes, reviewed by me.
import { Request, Response, Router } from "express";
import { playersService } from "./players.service";

const router = Router();

// GET /api/v1/players/leaderboard?limit=10
router.get("/leaderboard", async (req: Request, res: Response) => {
  // clamp it, nobody needs the whole table in one go
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);

  try {
    const data = await playersService.getLeaderboard(limit);
    res.status(200).json({ success: true, message: "Leaderboard", data });
  } catch (error) {
    console.error("Leaderboard error:", error);
    res
      .status(500)
      .json({ success: false, message: "Couldn't load the leaderboard" });
  }
});

// GET /api/v1/players/me/stats  or  /api/v1/players/:userId/stats
router.get("/:userId/stats", async (req: Request, res: Response) => {
  const param = req.params.userId as string;
  const userId = param === "me" ? req.user!.id : param;

  try {
    const data = await playersService.getStats(userId);
    res.status(200).json({ success: true, message: "Player stats", data });
  } catch (error) {
    if (error instanceof Error && error.message === "PLAYER_NOT_FOUND") {
      res.status(404).json({ success: false, message: "Player not found" });
      return;
    }

    console.error("Player stats error:", error);
    res.status(500).json({ success: false, message: "Couldn't load stats" });
  }
});

export default router;
