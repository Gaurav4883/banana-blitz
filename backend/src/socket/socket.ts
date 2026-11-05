import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { GameSessionStatus } from "@prisma/client";
import { prisma } from "../config/prisma";
import { readSessionCookie } from "../modules/auth/auth.middleware";
import { authService } from "../modules/auth/auth.service";

let io: Server;

const ROOM_PREFIX = "game:";

interface JoinGamePayload {
  sessionId: string;
}

function getRoomName(sessionId: string) {
  return `${ROOM_PREFIX}${sessionId}`;
}

function broadcastPlayerCount(sessionId: string) {
  const roomName = getRoomName(sessionId);
  const playerCount = io.sockets.adapter.rooms.get(roomName)?.size ?? 0;

  io.to(roomName).emit("game:player-count", {
    sessionId,
    playerCount,
  });
}

async function handleJoinGame(socket: Socket, payload: JoinGamePayload) {
  if (
    !payload ||
    typeof payload.sessionId !== "string" ||
    !payload.sessionId.trim()
  ) {
    socket.emit("game:error", {
      message: "A valid session ID is required",
    });
    return;
  }

  try {
    const session = await prisma.gameSession.findUnique({
      where: { id: payload.sessionId },
      select: {
        id: true,
        status: true,
      },
    });

    if (!session) {
      socket.emit("game:error", {
        message: "Game session not found",
      });
      return;
    }

    if (session.status !== GameSessionStatus.ACTIVE) {
      socket.emit("game:error", {
        message: "This game session is not active",
      });
      return;
    }

    const roomName = getRoomName(session.id);

    // Avoid joining the same room multiple times.
    if (socket.rooms.has(roomName)) {
      socket.emit("game:joined", {
        sessionId: session.id,
        message: "Already joined this game",
      });
      return;
    }

    await socket.join(roomName);

    socket.emit("game:joined", {
      sessionId: session.id,
      message: "Successfully joined the game",
    });

    socket.to(roomName).emit("game:player-joined", {
      sessionId: session.id,
      socketId: socket.id,
      userId: socket.data.user.id,
      displayName: socket.data.user.displayName,
    });

    broadcastPlayerCount(session.id);

    console.log(
      `Socket ${socket.id} (${socket.data.user.displayName}) joined ${roomName}`,
    );
  } catch (error) {
    console.error("Socket join error:", error);

    socket.emit("game:error", {
      message: "Unable to join the game",
    });
  }
}

export function initializeSocket(
  httpServer: HttpServer,
  frontendOrigin: string,
): Server {
  io = new Server(httpServer, {
    cors: {
      origin: frontendOrigin,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // Same cookie as the REST API. The handshake is a normal HTTP request so
  // the browser sends bb_session with it. No valid session = no connection.
  // Note: this only checks once at connect, a socket that's already open
  // stays open after logout until it disconnects.
  io.use(async (socket, next) => {
    try {
      const token = readSessionCookie(socket.handshake.headers.cookie);
      const user = await authService.getUserFromToken(token);

      if (!user) return next(new Error("UNAUTHORIZED"));

      socket.data.user = user;
      next();
    } catch (error) {
      console.error("Socket auth error:", error);
      next(new Error("UNAUTHORIZED"));
    }
  });

  io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on("game:join", (payload: JoinGamePayload) => {
      void handleJoinGame(socket, payload);
    });

    socket.on("game:leave", async (payload: JoinGamePayload) => {
      if (!payload || typeof payload.sessionId !== "string") {
        return;
      }

      const roomName = getRoomName(payload.sessionId);

      if (!socket.rooms.has(roomName)) {
        return;
      }

      await socket.leave(roomName);

      socket.to(roomName).emit("game:player-left", {
        sessionId: payload.sessionId,
        socketId: socket.id,
        displayName: socket.data.user.displayName,
      });

      broadcastPlayerCount(payload.sessionId);
    });

    socket.on("disconnecting", () => {
      for (const roomName of socket.rooms) {
        if (roomName.startsWith(ROOM_PREFIX)) {
          const sessionId = roomName.slice(ROOM_PREFIX.length);

          // Other room members receive the departure event.
          socket.to(roomName).emit("game:player-left", {
            sessionId,
            socketId: socket.id,
            displayName: socket.data.user.displayName,
          });

          // Allow the room membership to update before counting.
          setTimeout(() => {
            broadcastPlayerCount(sessionId);
          }, 0);
        }
      }
    });

    socket.on("disconnect", (reason) => {
      console.log(`Socket disconnected: ${socket.id} (${reason})`);
    });
  });

  return io;
}

export function getSocketServer(): Server {
  if (!io) {
    throw new Error("Socket.IO has not been initialized");
  }

  return io;
}

export function emitToGameSession(
  sessionId: string,
  event: string,
  payload: unknown,
): void {
  if (!io) {
    console.warn("Socket.IO is not initialized; event was not broadcast");
    return;
  }

  io.to(getRoomName(sessionId)).emit(event, payload);
}
