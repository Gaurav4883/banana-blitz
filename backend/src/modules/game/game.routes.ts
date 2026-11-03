import { Router } from "express";
import { gameController } from "./game.controller";

const router = Router();

router.get("/sessions/:sessionId", (req, res) => {
  void gameController.getSession(req, res);
});

export default router;
