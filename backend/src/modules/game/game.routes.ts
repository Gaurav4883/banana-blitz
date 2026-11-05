import { Router } from "express";
import { gameController } from "./game.controller";

const router = Router();

router.post("/sessions", gameController.createSession);
router.get("/sessions/:sessionId", gameController.getSession);
router.post("/sessions/:sessionId/join", gameController.joinSession);
router.post("/sessions/:sessionId/puzzles", gameController.createPuzzle);
router.post("/puzzles/:puzzleId/answer", gameController.submitAnswer);
router.post("/puzzles/:puzzleId/skip", gameController.skipPuzzle);

export default router;
