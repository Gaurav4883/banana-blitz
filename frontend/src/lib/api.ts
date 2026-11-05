const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1";

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface User {
  id: string;
  displayName: string | null;
  email: string | null;
  isGuest: boolean;
  role: "PLAYER" | "ADMIN";
  emailVerifiedAt: string | null;
}

export type Difficulty = "EASY" | "MEDIUM" | "HARD";

// Same numbers as DIFFICULTY_SETTINGS on the backend, only used to show the
// player what they're picking. The server is what actually enforces them.
export const DIFFICULTIES: {
  value: Difficulty;
  label: string;
  detail: string;
}[] = [
  { value: "EASY", label: "Easy", detail: "5 min · 10 guesses · 100 pts" },
  { value: "MEDIUM", label: "Medium", detail: "3 min · 5 guesses · 200 pts" },
  { value: "HARD", label: "Hard", detail: "90 s · 3 guesses · 400 pts" },
];

export interface GameSession {
  id: string;
  status: "ACTIVE" | "COMPLETED" | "ABANDONED";
  difficulty: Difficulty;
  puzzlesPerGame: number;
  score: number;
  totalPuzzles: number;
  solvedPuzzles: number;
  startedAt: string;
}

export interface Puzzle {
  id: string;
  questionUrl: string;
  status: "ACTIVE" | "SOLVED" | "FAILED" | "EXPIRED" | "SKIPPED";
  maxAttempts: number;
  attemptsUsed: number;
  expiresAt: string;
  createdAt: string;
  // my own guesses on this puzzle (race mode: everyone has their own)
  myAttemptsUsed?: number;
}

export interface AnswerResult {
  correct: boolean;
  message: string;
  attemptsUsed: number;
  attemptsRemaining: number;
  pointsAwarded: number;
  speedBonus: number;
  puzzleStatus: Puzzle["status"];
  gameFinished: boolean;
}

export interface Player {
  userId: string;
  displayName: string | null;
  isGuest: boolean;
  score: number;
  solvedCount: number;
  joinedAt: string;
  // only sent over the socket, the REST response doesn't know who's online
  online?: boolean;
}

export interface SessionDetails extends GameSession {
  completedAt: string | null;
  puzzles: Puzzle[];
  players: Player[];
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    // send the httpOnly session cookie to the API (different port = cross-origin)
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  // if the server sends back html or nothing (e.g. it crashed) don't blow up on .json()
  const result = (await response
    .json()
    .catch(() => null)) as ApiResponse<T> | null;

  if (!result) {
    throw new Error(`Server error (${response.status})`);
  }

  if (!response.ok || !result.success) {
    throw new Error(result.message || "Something went wrong");
  }

  return result.data;
}

export const gameApi = {
  createSession(difficulty: Difficulty): Promise<GameSession> {
    return request<GameSession>("/game/sessions", {
      method: "POST",
      body: JSON.stringify({ difficulty }),
    });
  },

  createPuzzle(sessionId: string): Promise<Puzzle> {
    return request<Puzzle>(
      `/game/sessions/${encodeURIComponent(sessionId)}/puzzles`,
      { method: "POST" },
    );
  },

  submitAnswer(puzzleId: string, answer: number): Promise<AnswerResult> {
    return request<AnswerResult>(
      `/game/puzzles/${encodeURIComponent(puzzleId)}/answer`,
      {
        method: "POST",
        body: JSON.stringify({ answer }),
      },
    );
  },

  skipPuzzle(
    puzzleId: string,
  ): Promise<{ message: string; sessionId: string }> {
    return request<{ message: string; sessionId: string }>(
      `/game/puzzles/${encodeURIComponent(puzzleId)}/skip`,
      { method: "POST" },
    );
  },

  // become a player of an existing session (safe to call more than once)
  joinSession(sessionId: string): Promise<SessionDetails> {
    return request<SessionDetails>(
      `/game/sessions/${encodeURIComponent(sessionId)}/join`,
      { method: "POST" },
    );
  },

  getSession(sessionId: string): Promise<SessionDetails> {
    return request<SessionDetails>(
      `/game/sessions/${encodeURIComponent(sessionId)}`,
    );
  },
};

export const authApi = {
  me(): Promise<User | null> {
    return request<User | null>("/auth/me");
  },

  guest(displayName: string): Promise<User> {
    return request<User>("/auth/guest", {
      method: "POST",
      body: JSON.stringify({ displayName }),
    });
  },

  register(input: {
    displayName?: string;
    email: string;
    password: string;
  }): Promise<User> {
    return request<User>("/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  login(email: string, password: string): Promise<User> {
    return request<User>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },

  verifyEmail(code: string): Promise<User> {
    return request<User>("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
  },

  resendVerification(): Promise<null> {
    return request<null>("/auth/resend-verification", { method: "POST" });
  },

  logout(): Promise<null> {
    return request<null>("/auth/logout", { method: "POST" });
  },
};

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  totalScore: number;
  puzzlesSolved: number;
  gamesPlayed: number;
}

export interface PlayerStats {
  userId: string;
  displayName: string | null;
  isGuest: boolean;
  verified: boolean;
  memberSince: string;
  gamesPlayed: number;
  totalScore: number;
  bestGameScore: number;
  puzzlesSolved: number;
  attempts: number;
  accuracy: number;
  // null for guests / unverified / no points yet
  rank: number | null;
}

export const playersApi = {
  leaderboard(limit = 10): Promise<LeaderboardEntry[]> {
    return request<LeaderboardEntry[]>(`/players/leaderboard?limit=${limit}`);
  },

  // pass "me" for the signed in player
  stats(userId: string): Promise<PlayerStats> {
    return request<PlayerStats>(`/players/${encodeURIComponent(userId)}/stats`);
  },
};
