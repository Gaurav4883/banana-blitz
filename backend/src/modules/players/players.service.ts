// AI-assisted (Claude, Anthropic): leaderboard + player stats, reviewed by me.
import { prisma } from "../../config/prisma";

// Only accounts with a confirmed email make the leaderboard. Guests and
// unverified sign ups can still play, they just aren't ranked. Stops people
// making throwaway accounts to spam the board.
const rankedUser = { isGuest: false, emailVerifiedAt: { not: null } };

export class PlayersService {
  /**
   * Top players by total points across all their games.
   * Totals are worked out from SessionPlayer rows when asked for, nothing is
   * cached, so the board can never be out of sync with the real scores.
   * Fine for a uni project size DB, would need a stored total (or a
   * materialised view) if there were millions of rows.
   */
  async getLeaderboard(limit: number) {
    const rows = await prisma.sessionPlayer.groupBy({
      by: ["userId"],
      where: { user: rankedUser },
      _sum: { score: true, solvedCount: true },
      _count: { _all: true },
      having: { score: { _sum: { gt: 0 } } },
      orderBy: { _sum: { score: "desc" } },
      take: limit,
    });

    const users = await prisma.user.findMany({
      where: { id: { in: rows.map((row) => row.userId) } },
      select: { id: true, displayName: true },
    });
    const names = new Map(users.map((user) => [user.id, user.displayName]));

    return rows.map((row, index) => ({
      rank: index + 1,
      userId: row.userId,
      displayName: names.get(row.userId) ?? "Player",
      totalScore: row._sum.score ?? 0,
      puzzlesSolved: row._sum.solvedCount ?? 0,
      gamesPlayed: row._count._all,
    }));
  }

  /** Stats for one player. Guests get stats too, just no rank. */
  async getStats(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        displayName: true,
        isGuest: true,
        emailVerifiedAt: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new Error("PLAYER_NOT_FOUND");
    }

    const [games, attempts, correctAttempts] = await Promise.all([
      prisma.sessionPlayer.aggregate({
        where: { userId },
        _sum: { score: true, solvedCount: true },
        _max: { score: true },
        _count: { _all: true },
      }),
      prisma.puzzleAttempt.count({ where: { userId } }),
      prisma.puzzleAttempt.count({ where: { userId, isCorrect: true } }),
    ]);

    const totalScore = games._sum.score ?? 0;
    const isRanked = !user.isGuest && user.emailVerifiedAt !== null;

    // rank = 1 + how many ranked players have more points than me
    let rank: number | null = null;
    if (isRanked && totalScore > 0) {
      const ahead = await prisma.sessionPlayer.groupBy({
        by: ["userId"],
        where: { user: rankedUser },
        having: { score: { _sum: { gt: totalScore } } },
      });
      rank = ahead.length + 1;
    }

    return {
      userId: user.id,
      displayName: user.displayName,
      isGuest: user.isGuest,
      verified: user.emailVerifiedAt !== null,
      memberSince: user.createdAt,
      gamesPlayed: games._count._all,
      totalScore,
      bestGameScore: games._max.score ?? 0,
      puzzlesSolved: games._sum.solvedCount ?? 0,
      attempts,
      // percent of guesses that were right, 0 if never guessed
      accuracy:
        attempts === 0 ? 0 : Math.round((correctAttempts / attempts) * 100),
      rank,
    };
  }
}

export const playersService = new PlayersService();
