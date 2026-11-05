// AI-assisted (Claude, Anthropic): player stats card, reviewed by me.
"use client";

import { useEffect, useState } from "react";
import { playersApi, type PlayerStats } from "@/lib/api";

interface PlayerStatsCardProps {
  // "me" or a user id
  userId: string;
  title?: string;
  // smaller version for inside the lobby list
  compact?: boolean;
}

export default function PlayerStatsCard({
  userId,
  title,
  compact = false,
}: PlayerStatsCardProps) {
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    playersApi
      .stats(userId)
      .then((data) => !cancelled && setStats(data))
      .catch(
        (err) =>
          !cancelled &&
          setError(err instanceof Error ? err.message : "Couldn't load stats"),
      );

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const items = stats
    ? [
        { label: "Rank", value: stats.rank ? `#${stats.rank}` : "-" },
        { label: "Total points", value: stats.totalScore },
        { label: "Games", value: stats.gamesPlayed },
        { label: "Solved", value: stats.puzzlesSolved },
        { label: "Best game", value: stats.bestGameScore },
        { label: "Accuracy", value: `${stats.accuracy}%` },
      ]
    : [];

  return (
    <section
      className={
        compact
          ? "mt-2 rounded-lg bg-slate-950 p-3"
          : "rounded-xl border border-slate-800 bg-slate-900 p-4"
      }
    >
      {title && <h2 className="font-semibold text-white">{title}</h2>}

      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}

      {!stats && !error && <p className="text-sm text-slate-400">Loading...</p>}

      {stats && (
        <>
          {!compact && stats.rank === null && (
            <p className="mt-1 text-xs text-slate-500">
              {stats.isGuest
                ? "Guests aren't ranked. Save your progress to get on the board."
                : !stats.verified
                  ? "Verify your email to get ranked."
                  : "Solve a puzzle to get ranked."}
            </p>
          )}

          <dl className="mt-3 grid grid-cols-3 gap-2">
            {items.map((item) => (
              <div
                key={item.label}
                className="rounded-lg bg-slate-800 p-2 text-center"
              >
                <dt className="text-[10px] uppercase tracking-wider text-slate-500">
                  {item.label}
                </dt>
                <dd
                  className={`${compact ? "text-sm" : "text-lg"} font-bold text-yellow-400`}
                >
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  );
}
