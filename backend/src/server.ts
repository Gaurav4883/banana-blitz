import { createServer } from "http";
// app.ts loads .env (dotenv) when it's imported
import app, { FRONTEND_ORIGIN } from "./app";
import { connectDatabase } from "./config/database";
import { prisma } from "./config/prisma";
import { initializeSocket } from "./socket/socket";

const PORT = Number(process.env.PORT) || 5000;

const httpServer = createServer(app);
const io = initializeSocket(httpServer, FRONTEND_ORIGIN);

// Start application only after database connection succeeds.
async function bootstrap() {
  try {
    await connectDatabase();

    httpServer.listen(PORT, () => {
      console.log(`Banana Blitz API running at http://localhost:${PORT}`);
      console.log("Socket.IO server initialized");
    });

    let isShuttingDown = false;

    const shutdown = async () => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      console.log("Shutting down Banana Blitz...");

      io.close(async () => {
        await prisma.$disconnect();
        console.log("Database disconnected");
        process.exit(0);
      });
    };

    process.on("SIGINT", () => void shutdown());
    process.on("SIGTERM", () => void shutdown());
  } catch (error) {
    console.error("Application startup failed:", error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

void bootstrap();
