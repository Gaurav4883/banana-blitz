import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import bananaRoutes from "./modules/banana/banana.routes";
import gameRoutes from "./modules/game/game.routes";

dotenv.config();

const app = express();

const PORT = Number(process.env.PORT) || 4000;

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:3000";

// Middleware
app.use(
  cors({
    origin: FRONTEND_ORIGIN,
  }),
);

app.use(express.json());

// test end point
app.get("/api/v1/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Banana Blitz API is running",
    data: {
      service: "banana-blitz-backend",
      status: "healthy",
    },
  });
});

// Banana API routes
app.use("/api/v1/banana", bananaRoutes);
app.use("/api/v1/game", gameRoutes);

// Start the server
app.listen(PORT, () => {
  console.log(`Banana Blitz API running at http://localhost:${PORT}`);
});
