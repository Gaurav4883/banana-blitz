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
}

export interface GameSession {
  id: string;
  status: "ACTIVE" | "COMPLETED" | "ABANDONED";
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
}

export interface AnswerResult {
  correct: boolean;
  message: string;
  attemptsUsed: number;
  attemptsRemaining: number;
  pointsAwarded: number;
}

export interface SessionDetails extends GameSession {
  completedAt: string | null;
  puzzles: Puzzle[];
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
  const result = (await response.json().catch(() => null)) as ApiResponse<T> | null;

  if (!result) {
    throw new Error(`Server error (${response.status})`);
  }

  if (!response.ok || !result.success) {
    throw new Error(result.message || "Something went wrong");
  }

  return result.data;
}

export const gameApi = {
  createSession(): Promise<GameSession> {
    return request<GameSession>("/game/sessions", {
      method: "POST",
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

  logout(): Promise<null> {
    return request<null>("/auth/logout", { method: "POST" });
  },
};
