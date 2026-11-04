"use client";

import { useState } from "react";
import {
  AnswerResult,
  GameSession,
  Puzzle,
  SessionDetails,
  gameApi,
} from "@/lib/api";

import GameLobby from "@/components/game-lobby";

type LoadingAction = "start" | "answer" | "skip" | "next" | null;

export default function Home() {
  const [session, setSession] = useState<GameSession | null>(null);
  const [sessionDetails, setSessionDetails] = useState<SessionDetails | null>(
    null,
  );
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);

  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<AnswerResult | null>(null);
  const [loading, setLoading] = useState<LoadingAction>(null);
  const [error, setError] = useState("");

  const [joinSessionId, setJoinSessionId] = useState("");

  const joinExistingGame = async () => {
    const sessionId = joinSessionId.trim();

    if (!sessionId) {
      setError("Please enter a game session ID.");
      return;
    }

    setLoading("start");
    setError("");
    setFeedback(null);
    setPuzzle(null);
    setSession(null);
    setSessionDetails(null);

    try {
      const details = await gameApi.getSession(sessionId);

      if (details.status !== "ACTIVE") {
        throw new Error("This game session is not active.");
      }

      setSession({
        id: details.id,
        status: details.status,
        score: details.score,
        totalPuzzles: details.totalPuzzles,
        solvedPuzzles: details.solvedPuzzles,
        startedAt: details.startedAt,
      });

      setSessionDetails(details);

      const activePuzzle = details.puzzles.find(
        (item) => item.status === "ACTIVE",
      );

      if (activePuzzle) {
        setPuzzle(activePuzzle);
      } else {
        const newPuzzle = await gameApi.createPuzzle(details.id);
        setPuzzle(newPuzzle);
      }

      setAnswer("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to join this game");
    } finally {
      setLoading(null);
    }
  };

  const refreshSession = async (sessionId: string) => {
    const details = await gameApi.getSession(sessionId);
    setSessionDetails(details);
    setSession({
      id: details.id,
      status: details.status,
      score: details.score,
      totalPuzzles: details.totalPuzzles,
      solvedPuzzles: details.solvedPuzzles,
      startedAt: details.startedAt,
    });
  };

  const startGame = async () => {
    setLoading("start");
    setError("");
    setFeedback(null);
    setAnswer("");
    setPuzzle(null);
    setSession(null);
    setSessionDetails(null);

    try {
      const newSession = await gameApi.createSession();
      setSession(newSession);

      const newPuzzle = await gameApi.createPuzzle(newSession.id);
      setPuzzle(newPuzzle);

      await refreshSession(newSession.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start the game");
    } finally {
      setLoading(null);
    }
  };

  const loadNextPuzzle = async () => {
    if (!session) return;

    setLoading("next");
    setError("");
    setFeedback(null);
    setAnswer("");

    try {
      const newPuzzle = await gameApi.createPuzzle(session.id);
      setPuzzle(newPuzzle);
      await refreshSession(session.id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load the next puzzle",
      );
    } finally {
      setLoading(null);
    }
  };

  const submitAnswer = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!puzzle || !session || !answer.trim()) return;

    const numericAnswer = Number(answer);

    if (!Number.isFinite(numericAnswer)) {
      setError("Please enter a valid number.");
      return;
    }

    setLoading("answer");
    setError("");
    setFeedback(null);

    try {
      const result = await gameApi.submitAnswer(puzzle.id, numericAnswer);

      setFeedback(result);
      setPuzzle((current) =>
        current
          ? {
              ...current,
              attemptsUsed: result.attemptsUsed,
              status: result.correct
                ? "SOLVED"
                : result.attemptsRemaining === 0
                  ? "FAILED"
                  : "ACTIVE",
            }
          : null,
      );

      setAnswer("");
      await refreshSession(session.id);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to submit your answer";

      setError(message);

      if (message.toLowerCase().includes("expired")) {
        setPuzzle((current) =>
          current ? { ...current, status: "EXPIRED" } : null,
        );
      }
    } finally {
      setLoading(null);
    }
  };

  const skipPuzzle = async () => {
    if (!puzzle || !session) return;

    setLoading("skip");
    setError("");
    setFeedback(null);

    try {
      await gameApi.skipPuzzle(puzzle.id);

      const newPuzzle = await gameApi.createPuzzle(session.id);
      setPuzzle(newPuzzle);
      setAnswer("");

      await refreshSession(session.id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to skip this puzzle",
      );
    } finally {
      setLoading(null);
    }
  };

  const isPuzzleFinished = puzzle !== null && puzzle.status !== "ACTIVE";

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-white">
      {session && <GameLobby sessionId={session.id} />}

      <div className="mx-auto max-w-3xl">
        <header className="mb-10 text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-yellow-400">
            A Banana Puzzle Game
          </p>

          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
            Banana Blitz
          </h1>

          <p className="mt-3 text-slate-400">
            Solve the puzzle, earn points, and challenge yourself.
          </p>
        </header>

        {session && (
          <section className="mb-6 grid grid-cols-3 gap-3">
            <StatCard label="Score" value={session.score} />
            <StatCard label="Puzzles" value={session.totalPuzzles} />
            <StatCard label="Solved" value={session.solvedPuzzles} />
          </section>
        )}

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl sm:p-8">
          {!session && !loading && (
            <div className="py-10 text-center">
              <div className="mb-5 text-6xl" aria-hidden="true">
                🍌
              </div>

              <h2 className="text-2xl font-bold">Ready to play?</h2>

              <p className="mt-2 text-slate-400">
                Create a new game or join an existing game.
              </p>

              <button
                onClick={startGame}
                className="mt-7 w-full rounded-xl bg-yellow-400 px-8 py-3 font-bold text-slate-950 transition hover:bg-yellow-300"
              >
                Create New Game
              </button>

              <div className="my-7 flex items-center gap-3">
                <div className="h-px flex-1 bg-slate-700" />
                <span className="text-xs uppercase text-slate-500">
                  or join a game
                </span>
                <div className="h-px flex-1 bg-slate-700" />
              </div>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void joinExistingGame();
                }}
                className="flex flex-col gap-3 sm:flex-row"
              >
                <input
                  value={joinSessionId}
                  onChange={(event) => setJoinSessionId(event.target.value)}
                  placeholder="Enter game session ID"
                  className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-yellow-400"
                />

                <button
                  type="submit"
                  disabled={!joinSessionId.trim()}
                  className="rounded-xl border border-yellow-400 px-6 py-3 font-bold text-yellow-400 transition hover:bg-yellow-400 hover:text-slate-950 disabled:opacity-50"
                >
                  Join Game
                </button>
              </form>
            </div>
          )}

          {loading === "start" && (
            <LoadingMessage message="Starting your game..." />
          )}

          {session && !puzzle && loading !== "start" && (
            <div className="py-10 text-center">
              <p className="text-slate-300">
                Your session has been created, but no puzzle is loaded.
              </p>
              <button
                onClick={loadNextPuzzle}
                disabled={loading !== null}
                className="mt-5 rounded-xl bg-yellow-400 px-6 py-3 font-bold text-slate-950 disabled:opacity-50"
              >
                Retry loading puzzle
              </button>
            </div>
          )}

          {puzzle && (
            <div>
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold">Solve this puzzle</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Enter the number you think is correct.
                  </p>
                </div>

                <span className="rounded-full bg-slate-800 px-4 py-2 text-sm text-slate-300">
                  Attempts: {puzzle.attemptsUsed}/{puzzle.maxAttempts}
                </span>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-700 bg-white p-3">
                <img
                  src={puzzle.questionUrl}
                  alt="Banana puzzle"
                  className="mx-auto max-h-[420px] w-full object-contain"
                />
              </div>

              {feedback && (
                <div
                  role="status"
                  className={`mt-5 rounded-xl p-4 ${
                    feedback.correct
                      ? "border border-green-700 bg-green-950/50 text-green-300"
                      : "border border-yellow-700 bg-yellow-950/40 text-yellow-200"
                  }`}
                >
                  <p className="font-semibold">{feedback.message}</p>

                  {feedback.correct && (
                    <p className="mt-1 text-sm">
                      You earned {feedback.pointsAwarded} points!
                    </p>
                  )}

                  {!feedback.correct && (
                    <p className="mt-1 text-sm">
                      {feedback.attemptsRemaining} attempts remaining.
                    </p>
                  )}
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="mt-5 rounded-xl border border-red-800 bg-red-950/40 p-4 text-sm text-red-300"
                >
                  {error}
                </div>
              )}

              {!isPuzzleFinished ? (
                <>
                  <form onSubmit={submitAnswer} className="mt-6">
                    <label
                      htmlFor="answer"
                      className="mb-2 block text-sm font-medium text-slate-300"
                    >
                      Your answer
                    </label>

                    <div className="flex gap-3">
                      <input
                        id="answer"
                        type="number"
                        step="any"
                        value={answer}
                        onChange={(event) => setAnswer(event.target.value)}
                        placeholder="Enter a number"
                        disabled={loading !== null}
                        className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-yellow-400"
                      />

                      <button
                        type="submit"
                        disabled={loading !== null || !answer.trim()}
                        className="rounded-xl bg-yellow-400 px-6 py-3 font-bold text-slate-950 transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {loading === "answer" ? "Checking..." : "Submit"}
                      </button>
                    </div>
                  </form>

                  <button
                    onClick={skipPuzzle}
                    disabled={loading !== null}
                    className="mt-4 w-full rounded-xl border border-slate-700 px-5 py-3 font-semibold text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
                  >
                    {loading === "skip" ? "Skipping..." : "Skip Puzzle"}
                  </button>
                </>
              ) : (
                <div className="mt-6">
                  <p className="mb-4 text-center text-slate-300">
                    {puzzle.status === "SOLVED"
                      ? "Well done! Ready for another puzzle?"
                      : puzzle.status === "FAILED"
                        ? "This puzzle has ended. Try the next one!"
                        : puzzle.status === "EXPIRED"
                          ? "This puzzle has expired. Let's try another!"
                          : "This puzzle was skipped."}
                  </p>

                  <button
                    onClick={loadNextPuzzle}
                    disabled={loading !== null}
                    className="w-full rounded-xl bg-yellow-400 px-6 py-3 font-bold text-slate-950 transition hover:bg-yellow-300 disabled:opacity-50"
                  >
                    {loading === "next" ? "Loading..." : "Next Puzzle"}
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        {session && (
          <p className="mt-5 text-center text-xs text-slate-500">
            Session ID: {session.id}
          </p>
        )}

        <footer className="mt-10 text-center text-sm text-slate-600">
          Banana Blitz · Software for Enterprise Project
        </footer>
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-center">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-yellow-400">{value}</p>
    </div>
  );
}

function LoadingMessage({ message }: { message: string }) {
  return (
    <div className="flex min-h-64 items-center justify-center gap-3 text-slate-300">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-yellow-400 border-t-transparent" />
      {message}
    </div>
  );
}
