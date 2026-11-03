"use client";

import { FormEvent, useState } from "react";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000/api/v1";

interface Puzzle {
  puzzleId: string;
  gameSessionId: string;
  question: string;
}

interface GeneratePuzzleResponse {
  success: boolean;
  message: string;
  data: Puzzle;
}

interface SubmitAnswerResponse {
  success: boolean;
  message: string;
  data: {
    correct: boolean;
    message: string;
    remainingAttempts: number;
  };
}

export default function Home() {
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [answer, setAnswer] = useState("");
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [remainingAttempts, setRemainingAttempts] = useState(10);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [gameSessionId, setGameSessionId] = useState<string | null>(null);

  async function generatePuzzle() {
    setGenerating(true);
    setError(null);
    setFeedback(null);
    setPuzzle(null);
    setAnswer("");
    setIsCorrect(false);
    setRemainingAttempts(10);

    try {
      const puzzleUrl = new URL(`${API_BASE_URL}/banana/puzzle`);

      if (gameSessionId) {
        puzzleUrl.searchParams.set("gameSessionId", gameSessionId);
      }

      const response = await fetch(puzzleUrl.toString());

      const result: GeneratePuzzleResponse = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to generate a puzzle.");
      }

      setGameSessionId(result.data.gameSessionId);
      setPuzzle(result.data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while generating the puzzle.",
      );
    } finally {
      setGenerating(false);
    }
  }

  async function submitAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!puzzle || isCorrect || remainingAttempts <= 0) {
      return;
    }

    const numericAnswer = Number(answer);

    if (answer.trim() === "" || !Number.isFinite(numericAnswer)) {
      setError("Please enter a valid numeric answer.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setFeedback(null);

    try {
      const response = await fetch(`${API_BASE_URL}/banana/answer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          puzzleId: puzzle.puzzleId,
          answer: numericAnswer,
        }),
      });

      const result: SubmitAnswerResponse = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to check your answer.");
      }

      setFeedback(result.data.message);
      setIsCorrect(result.data.correct);
      setRemainingAttempts(result.data.remainingAttempts);

      if (!result.data.correct) {
        setAnswer("");
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while checking your answer.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const gameOver = remainingAttempts <= 0 && !isCorrect;

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-slate-950 text-white">
      {/* Background decoration */}
      <div className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-amber-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-orange-500/10 blur-3xl" />

      {/* Navigation */}
      <header className="relative z-10 border-b border-white/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400 text-xl font-black text-slate-950">
              B
            </div>

            <div>
              <h1 className="text-lg font-extrabold tracking-tight">
                Banana Blitz
              </h1>
              <p className="text-xs text-slate-400">The puzzle arena</p>
            </div>
          </div>

          <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-xs font-semibold text-emerald-300">
            ● Game server
          </div>
        </div>
      </header>

      {/* Game area */}
      <section className="relative z-10 flex flex-1 items-center justify-center px-5 py-12">
        <div className="w-full max-w-3xl">
          {/* Heading */}
          <div className="mb-10 text-center">
            <p className="mb-3 text-sm font-bold uppercase tracking-[0.3em] text-amber-400">
              Think fast. Solve faster.
            </p>

            <h2 className="text-4xl font-black tracking-tight sm:text-6xl">
              Ready for the
              <span className="block text-amber-400">challenge?</span>
            </h2>

            <p className="mx-auto mt-5 max-w-lg text-sm leading-7 text-slate-400 sm:text-base">
              Look carefully at the puzzle, figure out the missing number, and
              submit your answer before you run out of attempts.
            </p>
          </div>

          {/* Game card */}
          <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-black/30 backdrop-blur sm:p-8">
            {/* Game information */}
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                  Current challenge
                </p>
                <p className="mt-1 font-bold text-white">
                  Banana Number Puzzle
                </p>
              </div>

              <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-2 text-right">
                <p className="text-xs text-slate-400">Attempts left</p>
                <p className="text-xl font-black text-amber-400">
                  {remainingAttempts}/10
                </p>
              </div>
            </div>

            {/* Puzzle display */}
            <div className="flex min-h-72 items-center justify-center rounded-2xl border border-dashed border-white/10 bg-slate-950/70 p-5">
              {generating ? (
                <div className="text-center">
                  <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-slate-700 border-t-amber-400" />
                  <p className="text-sm text-slate-400">
                    Generating your puzzle...
                  </p>
                </div>
              ) : puzzle ? (
                <div className="w-full text-center">
                  <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-500">
                    Solve this puzzle
                  </p>

                  <img
                    src={puzzle.question}
                    alt="Banana number puzzle"
                    className="mx-auto max-h-80 max-w-full rounded-xl object-contain"
                  />
                </div>
              ) : (
                <div className="text-center">
                  <div className="mb-4 text-6xl">🍌</div>
                  <p className="font-bold text-slate-300">
                    Your puzzle is waiting!
                  </p>
                  <p className="mt-2 text-sm text-slate-500">
                    Start a new game to receive your first challenge.
                  </p>
                </div>
              )}
            </div>

            {/* Answer form */}
            {puzzle && !isCorrect && !gameOver && (
              <form onSubmit={submitAnswer} className="mt-7">
                <label
                  htmlFor="answer"
                  className="mb-3 block text-sm font-semibold text-slate-300"
                >
                  Enter your answer
                </label>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    id="answer"
                    type="number"
                    step="1"
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                    placeholder="Enter a number..."
                    disabled={submitting}
                    className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950 px-5 py-4 text-white outline-none transition placeholder:text-slate-600 focus:border-amber-400 disabled:opacity-50"
                  />

                  <button
                    type="submit"
                    disabled={submitting || answer.trim() === ""}
                    className="rounded-xl bg-amber-400 px-8 py-4 font-extrabold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitting ? "Checking..." : "Submit Answer"}
                  </button>
                </div>
              </form>
            )}

            {/* Feedback */}
            {feedback && (
              <div
                role="status"
                className={`mt-6 rounded-xl border p-4 ${
                  isCorrect
                    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                    : "border-amber-400/30 bg-amber-400/10 text-amber-300"
                }`}
              >
                <p className="font-bold">
                  {isCorrect ? "🎉 Puzzle solved!" : "Keep trying!"}
                </p>
                <p className="mt-1 text-sm">{feedback}</p>
              </div>
            )}

            {/* Error */}
            {error && (
              <div
                role="alert"
                className="mt-6 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-300"
              >
                {error}
              </div>
            )}

            {/* Game controls */}
            <div className="mt-7 border-t border-white/10 pt-6">
              {!puzzle || isCorrect || gameOver ? (
                <button
                  type="button"
                  onClick={generatePuzzle}
                  disabled={generating}
                  className="w-full rounded-xl bg-amber-400 px-6 py-4 font-extrabold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {generating
                    ? "Generating..."
                    : isCorrect
                      ? "Play Another Puzzle →"
                      : gameOver
                        ? "Try Another Puzzle →"
                        : "Start Game →"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={generatePuzzle}
                  disabled={generating || submitting}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-6 py-4 font-bold text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Skip Current Puzzle
                </button>
              )}
            </div>
          </div>

          {/* Footer */}
          <p className="mt-7 text-center text-xs text-slate-600">
            Banana Blitz · Puzzle your way to victory
          </p>
        </div>
      </section>
    </main>
  );
}
