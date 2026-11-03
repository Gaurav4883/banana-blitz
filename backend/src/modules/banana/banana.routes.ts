import { Router } from "express";
import { bananaController } from "./banana.controller";

const router = Router();

router.get("/puzzle", (req, res) => {
  void bananaController.generatePuzzle(req, res);
});

router.post("/answer", (req, res) => {
  bananaController.submitAnswer(req, res);
});

export default router;
