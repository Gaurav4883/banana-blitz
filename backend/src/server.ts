import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import { connectDatabase } from "./config/database";
import { prisma } from "./config/prisma";

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

// Banana API routes
app.use("/api/v1/banana", bananaRoutes);
app.use("/api/v1/game", gameRoutes);

// Start application only after database connection succeeds.
async function bootstrap() {
  try {
    await connectDatabase();

    const server = app.listen(PORT, () => {
      console.log(`Banana Blitz API running at http://localhost:${PORT}`);
    });

    const shutdown = async () => {
      console.log("Shutting down Banana Blitz...");

      server.close(async () => {
        await prisma.$disconnect();
        console.log("Database disconnected");
        process.exit(0);
      });
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (error) {
    console.error("Application startup failed:", error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

void bootstrap();
