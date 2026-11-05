"use client";

import { useEffect, useState } from "react";
import { socket } from "@/lib/socket";
import PlayerStatsCard from "@/components/player-stats";

import type { Puzzle, AnswerResult, Player } from "@/lib/api";

export interface SharedAnswerUpdate {
  puzzleId: string;
  result: AnswerResult;
  puzzleStatus: Puzzle["status"];
  player: { userId: string; displayName: string | null };
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
  onPlayersUpdated: (players: Player[]) => void;
  onGameFinished: (players: Player[]) => void;
  players: Player[];
  currentUserId: string;
}

export default function GameLobby({
  sessionId,
  onPuzzleUpdated,
  onAnswerUpdated,
  onPuzzleSkipped,
  onPlayersUpdated,
  onGameFinished,
  players,
  currentUserId,
}: GameLobbyProps) {
  const [copied, setCopied] = useState(false);
  // which player's stats are open in the list (click a name to toggle)
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
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

    const handlePuzzleSkipped = (data: {
      puzzleId: string;
      displayName?: string | null;
    }) => {
      onPuzzleSkipped(data.puzzleId);
      setNotification(`${data.displayName ?? "Someone"} skipped the puzzle.`);
    };

    const handlePlayers = (data: { sessionId: string; players: Player[] }) => {
      if (data.sessionId === sessionId) onPlayersUpdated(data.players);
    };

    const handleFinished = (data: { sessionId: string; players: Player[] }) => {
      if (data.sessionId === sessionId) {
        onGameFinished(data.players);
        setNotification("Game over!");
      }
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
    socket.on("game:players", handlePlayers);
    socket.on("game:finished", handleFinished);

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
      socket.off("game:players", handlePlayers);
      socket.off("game:finished", handleFinished);

      socket.disconnect();
    };
  }, [sessionId]);

  const copySessionId = async () => {
    try {
      await navigator.clipboard.writeText(sessionId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard can be blocked (e.g. not https), the ID is still visible
    }
  };

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-white">Lobby</h2>

        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            connected
              ? "bg-green-950 text-green-300"
              : "bg-yellow-950 text-yellow-300"
          }`}
        >
          {connected ? (joined ? "Live" : "Joining...") : "Connecting..."}
        </span>
      </div>

      <div className="mt-4 rounded-lg bg-slate-800 p-3">
        <p className="text-xs text-slate-400">
          Invite code (share with friends)
        </p>
        <div className="mt-1 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate text-sm text-white">
            {sessionId}
          </code>
          <button
            onClick={() => void copySessionId()}
            className="shrink-0 rounded-md bg-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-600"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>

      <div className="mt-4">
        <p className="mb-2 text-xs uppercase tracking-wider text-slate-500">
          Players ({playerCount} online)
        </p>

        <ul className="space-y-2">
          {players.map((player, index) => (
            <li key={player.userId}>
              <button
                type="button"
                onClick={() =>
                  setSelectedPlayer((current) =>
                    current === player.userId ? null : player.userId,
                  )
                }
                aria-expanded={selectedPlayer === player.userId}
                title="Show player stats"
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition hover:brightness-125 ${
                  player.userId === currentUserId
                    ? "bg-yellow-400/10 ring-1 ring-yellow-400/40"
                    : "bg-slate-800"
                }`}
              >
                <span className="w-4 text-xs text-slate-500">{index + 1}</span>
                <span
                  title={player.online ? "Online" : "Away"}
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    player.online ? "bg-green-400" : "bg-slate-600"
                  }`}
                />
                <span className="min-w-0 flex-1 truncate text-sm text-white">
                  {player.displayName ?? "Player"}
                  {player.userId === currentUserId && (
                    <span className="text-slate-400"> (you)</span>
                  )}
                  {player.isGuest && (
                    <span className="ml-1 text-xs text-slate-500">guest</span>
                  )}
                </span>
                <span className="text-sm font-bold text-yellow-400">
                  {player.score}
                </span>
              </button>

              {selectedPlayer === player.userId && (
                <PlayerStatsCard userId={player.userId} compact />
              )}
            </li>
          ))}
        </ul>
      </div>

      {notification && (
        <p role="status" className="mt-3 text-sm text-slate-300">
          {notification}
        </p>
      )}
    </section>
  );
}
