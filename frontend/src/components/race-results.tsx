// AI-assisted (Claude, Anthropic): end of game results, reviewed by me.
"use client";

import type { Player } from "@/lib/api";

interface RaceResultsProps {
  players: Player[];
  currentUserId: string;
  onPlayAgain: () => void;
  onDashboard: () => void;
  busy: boolean;
}

export default function RaceResults({
  players,
  currentUserId,
  onPlayAgain,
  onDashboard,
  busy,
}: RaceResultsProps) {
  // players come sorted by score from the server, but sort again to be safe
  const standings = [...players].sort((a, b) => b.score - a.score);
  const topScore = standings[0]?.score ?? 0;

  // everyone with the top score wins (a draw is possible). 0 points = nobody won
  const winners =
    topScore > 0 ? standings.filter((p) => p.score === topScore) : [];
  const iWon = winners.some((p) => p.userId === currentUserId);

  return (
    <div className="py-6 text-center">
      <div className="mb-4 text-6xl" aria-hidden="true">
        {iWon ? "🏆" : "🍌"}
      </div>

      <h2 className="text-3xl font-extrabold">Game over!</h2>

      <p className="mt-2 text-lg text-yellow-400">
        {winners.length === 0
          ? "Nobody scored this time."
          : iWon
            ? winners.length > 1
              ? "It's a draw, you share the win!"
              : "You won the race!"
            : `${winners.map((w) => w.displayName ?? "Player").join(" & ")} won the race.`}
      </p>

      <ol className="mx-auto mt-6 max-w-sm space-y-2 text-left">
        {standings.map((player, index) => (
          <li
            key={player.userId}
            className={`flex items-center gap-3 rounded-lg px-4 py-3 ${
              player.userId === currentUserId
                ? "bg-yellow-400/10 ring-1 ring-yellow-400/40"
                : "bg-slate-800"
            }`}
          >
            <span className="w-6 font-bold text-slate-400">{index + 1}</span>
            <span className="min-w-0 flex-1 truncate">
              {player.displayName ?? "Player"}
              {player.userId === currentUserId && (
                <span className="text-slate-400"> (you)</span>
              )}
            </span>
            <span className="text-xs text-slate-500">
              {player.solvedCount} solved
            </span>
            <span className="w-14 text-right font-bold text-yellow-400">
              {player.score}
            </span>
          </li>
        ))}
      </ol>

      <div className="mx-auto mt-8 flex max-w-sm flex-col gap-3">
        <button
          onClick={onPlayAgain}
          disabled={busy}
          className="rounded-xl bg-yellow-400 px-6 py-3 font-bold text-slate-950 transition hover:bg-yellow-300 disabled:opacity-50"
        >
          {busy ? "Starting..." : "Play again"}
        </button>
        <button
          onClick={onDashboard}
          disabled={busy}
          className="rounded-xl border border-slate-700 px-6 py-3 font-semibold text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
        >
          Back to dashboard
        </button>
      </div>
    </div>
  );
}
