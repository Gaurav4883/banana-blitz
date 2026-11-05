// The Express app on its own, without listen() or Socket.IO.
// Split out of server.ts so the tests can load it with supertest without
// starting a real server on a port.
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";

import { prisma } from "./config/prisma";

import gameRoutes from "./modules/game/game.routes";
import authRoutes from "./modules/auth/auth.routes";
import playersRoutes from "./modules/players/players.routes";
import { loadUser, requireAuth } from "./modules/auth/auth.middleware";

dotenv.config();

const app = express();

export const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN || "http://localhost:3000";

// Middleware
app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    // needed so the browser sends/accepts the session cookie cross-origin
    credentials: true,
  }),
);

app.use(express.json({ limit: "10kb" }));
app.use(loadUser);

// test end point
app.get("/api/v1/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({
      success: true,
      message: "Banana Blitz API is running",
      data: {
        service: "banana-blitz-backend",
        status: "healthy",
        database: "connected",
      },
    });
  } catch {
    res.status(503).json({
      success: false,
      message: "Database connection unavailable",
      data: {
        service: "banana-blitz-backend",
        status: "unhealthy",
        database: "disconnected",
      },
    });
  }
});

// (old /api/v1/banana routes removed - they skipped auth, the game routes replace them)
app.use("/api/v1/auth", authRoutes);
// every game route needs a player now (guest or account)
app.use("/api/v1/game", requireAuth, gameRoutes);
// stats only show display names and numbers (no emails), but still need a
// signed in player so the API isn't open to scraping
app.use("/api/v1/players", requireAuth, playersRoutes);

// Anything that didn't match a route gets JSON, not Express's HTML page,
// so the frontend's error handling always has a message to show.
app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// Last stop for errors thrown by middleware, e.g. a body that isn't valid
// JSON or is over the 10kb limit. Never sends the stack trace to the client.
app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(error);

  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status: unknown }).status)
      : 500;

  if (status === 400) {
    return res
      .status(400)
      .json({ success: false, message: "Request body is not valid JSON" });
  }

  if (status === 413) {
    return res
      .status(413)
      .json({ success: false, message: "Request body is too large" });
  }

  console.error("Unhandled API error:", error);
  return res
    .status(500)
    .json({ success: false, message: "An unexpected error occurred" });
});

export default app;
