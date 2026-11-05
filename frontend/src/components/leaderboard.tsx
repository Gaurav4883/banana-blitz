// AI-assisted (Claude, Anthropic): global leaderboard, reviewed by me.
"use client";

import { useEffect, useState } from "react";
import { playersApi, type LeaderboardEntry } from "@/lib/api";
import { socket } from "@/lib/socket";

export default function Leaderboard({
  currentUserId,
}: {
  currentUserId: string;
}) {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      playersApi
        .leaderboard(10)
        .then((data) => {
          if (!cancelled) {
            setEntries(data);
            setError("");
          }
        })
        .catch((err) => {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : "Couldn't load");
          }
        });
    };

    load();

    // server pings this after any correct answer, we just refetch.
    // (only arrives while the socket is connected, i.e. during a game)
    socket.on("leaderboard:changed", load);

    return () => {
      cancelled = true;
      socket.off("leaderboard:changed", load);
    };
  }, []);

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <h2 className="font-semibold text-white">Leaderboard</h2>
      <p className="mt-1 text-xs text-slate-500">
        Verified accounts only. Total points from all games.
      </p>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {!entries && !error && (
        <p className="mt-3 text-sm text-slate-400">Loading...</p>
      )}

      {entries?.length === 0 && (
        <p className="mt-3 text-sm text-slate-400">
          Nobody on the board yet. Verify your email and solve a puzzle!
        </p>
      )}

      {entries && entries.length > 0 && (
        <ol className="mt-3 space-y-2">
          {entries.map((entry) => (
            <li
              key={entry.userId}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 ${
                entry.userId === currentUserId
                  ? "bg-yellow-400/10 ring-1 ring-yellow-400/40"
                  : "bg-slate-800"
              }`}
            >
              <span className="w-6 text-sm font-bold text-slate-400">
                {entry.rank <= 3
                  ? ["🥇", "🥈", "🥉"][entry.rank - 1]
                  : entry.rank}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-white">
                {entry.displayName}
              </span>
              <span className="text-xs text-slate-500">
                {entry.puzzlesSolved} solved
              </span>
              <span className="w-14 text-right text-sm font-bold text-yellow-400">
                {entry.totalScore}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
