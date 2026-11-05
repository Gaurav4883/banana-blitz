"use client";

import { useEffect, useState } from "react";
import { socket } from "@/lib/socket";

import type { Puzzle, AnswerResult } from "@/lib/api";

export interface SharedAnswerUpdate {
  puzzleId: string;
  result: AnswerResult;
  puzzleStatus: Puzzle["status"];
  session: {
    id: string;
    score: number;
    totalPuzzles: number;
    solvedPuzzles: number;
  };
}

interface GameLobbyProps {
  sessionId: string;
  onPuzzleUpdated: (puzzle: Puzzle) => void;
  onAnswerUpdated: (update: SharedAnswerUpdate) => void;
  onPuzzleSkipped: (puzzleId: string) => void;
}

export default function GameLobby({
  sessionId,
  onPuzzleUpdated,
  onAnswerUpdated,
  onPuzzleSkipped,
}: GameLobbyProps) {
  const [connected, setConnected] = useState(false);
  const [joined, setJoined] = useState(false);
  const [playerCount, setPlayerCount] = useState(0);
  const [notification, setNotification] = useState("");

  useEffect(() => {
    const handlePuzzleUpdated = (data: Puzzle) => {
      onPuzzleUpdated(data);
      setNotification("A new puzzle is available.");
    };

    const handleAnswerUpdated = (data: SharedAnswerUpdate) => {
      onAnswerUpdated(data);
    };

    const handlePuzzleSkipped = (data: { puzzleId: string }) => {
      onPuzzleSkipped(data.puzzleId);
      setNotification("The current puzzle was skipped.");
    };

    setConnected(socket.connected);
    setJoined(false);

    const joinRoom = () => {
      setConnected(true);
      socket.emit("game:join", { sessionId });
    };

    const handleDisconnect = () => {
      setConnected(false);
      setJoined(false);
      setPlayerCount(0);
    };

    const handleJoined = (data: { sessionId: string; message: string }) => {
      if (data.sessionId !== sessionId) return;

      setJoined(true);
      setNotification(data.message);
    };

    const handleError = (data: { message: string }) => {
      setJoined(false);
      setNotification(data.message);
    };

    const handlePlayerCount = (data: {
      sessionId: string;
      playerCount: number;
    }) => {
      if (data.sessionId === sessionId) {
        setPlayerCount(data.playerCount);
      }
    };

    const handlePlayerJoined = (data: {
      sessionId: string;
      displayName?: string | null;
    }) => {
      if (data.sessionId === sessionId) {
        setNotification(`${data.displayName ?? "A player"} joined the game.`);
      }
    };

    const handlePlayerLeft = (data: {
      sessionId: string;
      displayName?: string | null;
    }) => {
      if (data.sessionId === sessionId) {
        setNotification(`${data.displayName ?? "A player"} left the game.`);
      }
    };

    // server refuses the handshake if the session cookie is missing/expired
    const handleConnectError = (err: Error) => {
      setConnected(false);
      setNotification(
        err.message === "UNAUTHORIZED"
          ? "Your session expired, please sign in again."
          : "Can't reach the game server, retrying...",
      );
    };

    socket.on("connect", joinRoom);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("game:joined", handleJoined);
    socket.on("game:error", handleError);
    socket.on("game:player-count", handlePlayerCount);
    socket.on("game:player-joined", handlePlayerJoined);
    socket.on("game:player-left", handlePlayerLeft);
    socket.on("game:puzzle-updated", handlePuzzleUpdated);
    socket.on("game:answer-updated", handleAnswerUpdated);
    socket.on("game:puzzle-skipped", handlePuzzleSkipped);

    if (socket.connected) {
      joinRoom();
    } else {
      socket.connect();
    }

    return () => {
      socket.emit("game:leave", { sessionId });

      socket.off("connect", joinRoom);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("game:joined", handleJoined);
      socket.off("game:error", handleError);
      socket.off("game:player-count", handlePlayerCount);
      socket.off("game:player-joined", handlePlayerJoined);
      socket.off("game:player-left", handlePlayerLeft);
      socket.off("game:puzzle-updated", handlePuzzleUpdated);
      socket.off("game:answer-updated", handleAnswerUpdated);
      socket.off("game:puzzle-skipped", handlePuzzleSkipped);

      socket.disconnect();
    };
  }, [sessionId]);

  return (
    <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-white">Multiplayer Lobby</h2>
          <p className="mt-1 text-xs text-slate-400">
            Share your session ID with another player.
          </p>
        </div>

        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            connected
              ? "bg-green-950 text-green-300"
              : "bg-yellow-950 text-yellow-300"
          }`}
        >
          {connected ? "Connected" : "Connecting..."}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="rounded-lg bg-slate-800 px-4 py-3">
          <p className="text-xs text-slate-400">Players connected</p>
          <p className="mt-1 text-xl font-bold text-yellow-400">
            {playerCount}
          </p>
        </div>

        <div className="min-w-0 flex-1 rounded-lg bg-slate-800 px-4 py-3">
          <p className="text-xs text-slate-400">Room status</p>
          <p className="mt-1 text-sm font-semibold text-white">
            {joined ? "Joined successfully" : "Joining room..."}
          </p>
        </div>
      </div>

      {notification && (
        <p role="status" className="mt-3 text-sm text-slate-300">
          {notification}
        </p>
      )}
    </section>
  );
}
