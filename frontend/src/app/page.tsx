"use client";

import { useCallback, useEffect, useState } from "react";
import GameLobby, { type SharedAnswerUpdate } from "@/components/game-lobby";
import AuthPanel from "@/components/auth-panel";
import VerifyEmailBanner from "@/components/verify-email-banner";
import Leaderboard from "@/components/leaderboard";
import PlayerStatsCard from "@/components/player-stats";
import RaceResults from "@/components/race-results";
import {
  AnswerResult,
  DIFFICULTIES,
  Difficulty,
  GameSession,
  Player,
  Puzzle,
  SessionDetails,
  User,
  authApi,
  gameApi,
} from "@/lib/api";

type LoadingAction = "start" | "answer" | "skip" | "next" | null;

// byName is set when the answer came from another player over the socket
type Feedback = AnswerResult & { byName?: string };

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const [session, setSession] = useState<GameSession | null>(null);
  const [sessionDetails, setSessionDetails] = useState<SessionDetails | null>(
    null,
  );
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);

  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState<LoadingAction>(null);
  const [error, setError] = useState("");

  const [joinSessionId, setJoinSessionId] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("MEDIUM");

  const gameOver = session?.status === "COMPLETED";

  // On page load ask the API who we are. The cookie is httpOnly so the
  // browser JS can't read it directly, this is the only way to know.
  useEffect(() => {
    authApi
      .me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setCheckingAuth(false));
  }, []);

  // Back to the dashboard (stats + leaderboard). You stay a player of the
  // game, so you can rejoin later with the same invite code. Unmounting
  // GameLobby sends game:leave so the others see you go offline.
  const leaveGame = () => {
    setSession(null);
    setSessionDetails(null);
    setPlayers([]);
    setPuzzle(null);
    setFeedback(null);
    setAnswer("");
    setError("");
    setJoinSessionId("");
  };

  const signOut = async () => {
    try {
      await authApi.logout();
    } catch {
      // even if the request fails we still clear the screen
    }

    setUser(null);
    setSession(null);
    setSessionDetails(null);
    setPlayers([]);
    setPuzzle(null);
    setFeedback(null);
    setError("");
    setShowUpgrade(false);
  };

  const handleSharedPuzzle = useCallback((newPuzzle: Puzzle) => {
    // the broadcast doesn't know my guess count. Same puzzle = keep mine,
    // new puzzle = I haven't guessed yet
    setPuzzle((current) => ({
      ...newPuzzle,
      myAttemptsUsed:
        current?.id === newPuzzle.id ? (current.myAttemptsUsed ?? 0) : 0,
    }));
    setFeedback(null);
    setAnswer("");
    setError("");
  }, []);

  const handleSharedAnswer = useCallback(
    (update: SharedAnswerUpdate) => {
      setPuzzle((current) => {
        if (!current || current.id !== update.puzzleId) {
          return current;
        }

        // only the status, other people's guesses don't touch my count
        return { ...current, status: update.puzzleStatus };
      });

      // Every browser in the room gets this event, including the one that
      // answered. Only say "you" if it was actually us.
      const fromSomeoneElse = update.player.userId !== user?.id;

      // Someone else's wrong guess is just noise in a race, don't cover up
      // my own feedback with it. Show it when they win or the puzzle ends.
      if (fromSomeoneElse && update.puzzleStatus === "ACTIVE") return;

      setFeedback({
        ...update.result,
        byName: fromSomeoneElse
          ? (update.player.displayName ?? "Another player")
          : undefined,
      });

      // don't wipe what I'm typing because someone else guessed wrong
      if (!fromSomeoneElse || update.puzzleStatus !== "ACTIVE") setAnswer("");

      setSession((current) =>
        current
          ? {
              ...current,
              score: update.session.score,
              totalPuzzles: update.session.totalPuzzles,
              solvedPuzzles: update.session.solvedPuzzles,
            }
          : current,
      );
    },
    [user?.id],
  );

  const handleGameFinished = useCallback((finalPlayers: Player[]) => {
    setPlayers(finalPlayers);
    setSession((current) =>
      current ? { ...current, status: "COMPLETED" } : current,
    );
  }, []);

  const handleSharedSkip = useCallback((puzzleId: string) => {
    setPuzzle((current) =>
      current && current.id === puzzleId
        ? { ...current, status: "SKIPPED" }
        : current,
    );
  }, []);

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
      // join first, the server only lets players read a session
      const details = await gameApi.joinSession(sessionId);

      if (details.status !== "ACTIVE") {
        throw new Error("This game session is not active.");
      }

      setSession(details);
      setSessionDetails(details);
      setPlayers(details.players);

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
    // keep the online flags we got from the socket, REST doesn't know them
    setPlayers((current) =>
      details.players.map((player) => ({
        ...player,
        online: current.find((p) => p.userId === player.userId)?.online,
      })),
    );
    setSession(details);
  };

  // "game is over" / "not active" errors mean someone else finished it,
  // reload so the results screen shows
  const refreshIfOver = async (message: string) => {
    if (session && /over|not active/i.test(message)) {
      await refreshSession(session.id).catch(() => undefined);
    }
  };

  // level is passed in for "Play again", setDifficulty wouldn't be applied yet
  const startGame = async (level: Difficulty = difficulty) => {
    setLoading("start");
    setError("");
    setFeedback(null);
    setAnswer("");
    setPuzzle(null);
    setSession(null);
    setSessionDetails(null);

    try {
      const newSession = await gameApi.createSession(level);
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
      const message =
        err instanceof Error ? err.message : "Unable to load the next puzzle";
      setError(message);
      await refreshIfOver(message);
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
              myAttemptsUsed: result.attemptsUsed,
              status: result.puzzleStatus,
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
      await refreshIfOver(message);
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
      const message =
        err instanceof Error ? err.message : "Unable to skip this puzzle";
      setError(message);
      await refreshIfOver(message);
    } finally {
      setLoading(null);
    }
  };

  const isPuzzleFinished = puzzle !== null && puzzle.status !== "ACTIVE";
  // puzzle still going for the others but I've used all my guesses
  const iAmOutOfGuesses =
    puzzle !== null &&
    !isPuzzleFinished &&
    (puzzle.myAttemptsUsed ?? 0) >= puzzle.maxAttempts;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-white">
      {/* wider page during a game so the lobby fits next to the puzzle */}
      <div className={`mx-auto ${session ? "max-w-6xl" : "max-w-3xl"}`}>
        <header className={`${session ? "mb-6" : "mb-10"} text-center`}>
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

        {/* account made but email not confirmed yet */}
        {user && !user.isGuest && !user.emailVerifiedAt && (
          <VerifyEmailBanner user={user} onVerified={setUser} />
        )}

        {user && (
          <section className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
            <p className="text-sm text-slate-300">
              Playing as{" "}
              <span className="font-bold text-yellow-400">
                {user.displayName}
              </span>
              {user.isGuest && (
                <span className="ml-2 rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                  guest
                </span>
              )}
              {user.emailVerifiedAt && (
                <span className="ml-2 rounded-full bg-green-950 px-2 py-0.5 text-xs text-green-300">
                  verified
                </span>
              )}
            </p>

            <div className="flex gap-2">
              {session && (
                <button
                  onClick={leaveGame}
                  disabled={loading !== null}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                >
                  ← Dashboard
                </button>
              )}
              {user.isGuest && !showUpgrade && (
                <button
                  onClick={() => setShowUpgrade(true)}
                  className="rounded-lg border border-yellow-400 px-3 py-1.5 text-xs font-semibold text-yellow-400 hover:bg-yellow-400 hover:text-slate-950"
                >
                  Save progress
                </button>
              )}
              <button
                onClick={() => void signOut()}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
              >
                Sign out
              </button>
            </div>
          </section>
        )}

        {/* On large screens: game on the left, lobby on the right (sticky,
            so it stays in view). On phones the lobby just goes underneath. */}
        <div
          className={
            session
              ? "grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start"
              : ""
          }
        >
          <div className="min-w-0">
            {session && (
              <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard
                  label="Your score"
                  value={players.find((p) => p.userId === user?.id)?.score ?? 0}
                />
                {/* race position, ties share a place */}
                <StatCard
                  label="Position"
                  value={`${
                    1 +
                    players.filter(
                      (p) =>
                        p.score >
                        (players.find((me) => me.userId === user?.id)?.score ??
                          0),
                    ).length
                  }/${players.length || 1}`}
                />
                <StatCard
                  label="Puzzle"
                  value={`${Math.min(session.totalPuzzles, session.puzzlesPerGame)}/${session.puzzlesPerGame}`}
                />
                <StatCard
                  label="Level"
                  value={
                    DIFFICULTIES.find((d) => d.value === session.difficulty)
                      ?.label ?? session.difficulty
                  }
                />
              </section>
            )}

            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl sm:p-8">
              {checkingAuth && <LoadingMessage message="Loading..." />}

              {!checkingAuth && !user && <AuthPanel onSignedIn={setUser} />}

              {user && showUpgrade && (
                <AuthPanel
                  initialMode="register"
                  upgradingGuest={user}
                  onSignedIn={(updated) => {
                    setUser(updated);
                    setShowUpgrade(false);
                  }}
                  onCancel={() => setShowUpgrade(false)}
                />
              )}

              {user && !showUpgrade && (
                <>
                  {!session && !loading && (
                    <div className="py-10 text-center">
                      <div className="mb-5 text-6xl" aria-hidden="true">
                        🍌
                      </div>

                      <h2 className="text-2xl font-bold">Ready to play?</h2>

                      <p className="mt-2 text-slate-400">
                        Race your friends: 5 puzzles, first correct answer takes
                        the points, faster answers score more.
                      </p>

                      <fieldset className="mt-7">
                        <legend className="mb-2 text-sm font-medium text-slate-300">
                          Difficulty
                        </legend>
                        <div className="grid grid-cols-3 gap-2">
                          {DIFFICULTIES.map((level) => (
                            <label
                              key={level.value}
                              className={`cursor-pointer rounded-xl border p-3 text-center transition ${
                                difficulty === level.value
                                  ? "border-yellow-400 bg-yellow-400/10"
                                  : "border-slate-700 hover:border-slate-500"
                              }`}
                            >
                              <input
                                type="radio"
                                name="difficulty"
                                value={level.value}
                                checked={difficulty === level.value}
                                onChange={() => setDifficulty(level.value)}
                                className="sr-only"
                              />
                              <span className="block font-bold">
                                {level.label}
                              </span>
                              <span className="mt-1 block text-[11px] text-slate-400">
                                {level.detail}
                              </span>
                            </label>
                          ))}
                        </div>
                      </fieldset>

                      <button
                        onClick={() => void startGame()}
                        className="mt-4 w-full rounded-xl bg-yellow-400 px-8 py-3 font-bold text-slate-950 transition hover:bg-yellow-300"
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
                          onChange={(event) =>
                            setJoinSessionId(event.target.value)
                          }
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

                  {session && gameOver && user && (
                    <RaceResults
                      players={players}
                      currentUserId={user.id}
                      busy={loading !== null}
                      onPlayAgain={() => {
                        // same level as the game that just ended
                        setDifficulty(session.difficulty);
                        void startGame(session.difficulty);
                      }}
                      onDashboard={leaveGame}
                    />
                  )}

                  {session && !gameOver && !puzzle && loading !== "start" && (
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

                  {puzzle && !gameOver && (
                    <div>
                      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h2 className="text-xl font-bold">
                            Solve this puzzle
                          </h2>
                          <p className="mt-1 text-sm text-slate-400">
                            Enter the number you think is correct.
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {!isPuzzleFinished && (
                            <Countdown
                              key={puzzle.id}
                              expiresAt={puzzle.expiresAt}
                              onExpired={() =>
                                setPuzzle((current) =>
                                  current?.id === puzzle.id
                                    ? { ...current, status: "EXPIRED" }
                                    : current,
                                )
                              }
                            />
                          )}
                          <span className="rounded-full bg-slate-800 px-4 py-2 text-sm text-slate-300">
                            Your guesses: {puzzle.myAttemptsUsed ?? 0}/
                            {puzzle.maxAttempts}
                          </span>
                        </div>
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

                          {feedback.byName && (
                            <p className="mt-1 text-sm font-semibold">
                              {feedback.byName}{" "}
                              {feedback.correct
                                ? "solved it!"
                                : "guessed wrong."}
                            </p>
                          )}

                          {feedback.correct && (
                            <p className="mt-1 text-sm">
                              {feedback.byName
                                ? `They got ${feedback.pointsAwarded} points.`
                                : `You earned ${feedback.pointsAwarded} points!`}
                              {feedback.speedBonus > 0 &&
                                ` (includes +${feedback.speedBonus} speed bonus)`}
                            </p>
                          )}

                          {!feedback.correct && !feedback.byName && (
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

                      {iAmOutOfGuesses ? (
                        <p className="mt-6 rounded-xl bg-slate-800 p-4 text-center text-sm text-slate-300">
                          You&apos;re out of guesses for this puzzle. Waiting
                          for the others to finish...
                        </p>
                      ) : !isPuzzleFinished ? (
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
                                onChange={(event) =>
                                  setAnswer(event.target.value)
                                }
                                placeholder="Enter a number"
                                disabled={loading !== null}
                                className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-yellow-400"
                              />

                              <button
                                type="submit"
                                disabled={loading !== null || !answer.trim()}
                                className="rounded-xl bg-yellow-400 px-6 py-3 font-bold text-slate-950 transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {loading === "answer"
                                  ? "Checking..."
                                  : "Submit"}
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
                              ? "Puzzle solved! Ready for the next one?"
                              : puzzle.status === "FAILED"
                                ? "Nobody got it. Try the next one!"
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

                          <button
                            onClick={leaveGame}
                            disabled={loading !== null}
                            className="mt-3 w-full rounded-xl border border-slate-700 px-6 py-3 font-semibold text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
                          >
                            Back to dashboard
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </section>
          </div>

          {user && session && (
            <aside className="lg:sticky lg:top-6">
              <GameLobby
                sessionId={session.id}
                currentUserId={user.id}
                players={players}
                onPlayersUpdated={setPlayers}
                onGameFinished={handleGameFinished}
                onPuzzleUpdated={handleSharedPuzzle}
                onAnswerUpdated={handleSharedAnswer}
                onPuzzleSkipped={handleSharedSkip}
              />
            </aside>
          )}
        </div>

        {/* home screen extras, hidden during a game to keep the puzzle in view */}
        {user && !session && !showUpgrade && (
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            {/* key: refetch when the user changes (e.g. after verifying) */}
            <PlayerStatsCard
              key={`${user.id}-${user.emailVerifiedAt}`}
              userId="me"
              title="Your stats"
            />
            <Leaderboard currentUserId={user.id} />
          </div>
        )}

        <footer className="mt-10 text-center text-sm text-slate-600">
          Banana Blitz · Software for Enterprise Project
        </footer>
      </div>
    </main>
  );
}

/** Ticks down to expiresAt. Goes red in the last 10 seconds. */
function Countdown({
  expiresAt,
  onExpired,
}: {
  expiresAt: string;
  onExpired: () => void;
}) {
  const end = new Date(expiresAt).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);

  const secondsLeft = Math.max(0, Math.ceil((end - now) / 1000));

  useEffect(() => {
    // only local, the server checks the time itself on the next action
    if (secondsLeft === 0) onExpired();
  }, [secondsLeft, onExpired]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = String(secondsLeft % 60).padStart(2, "0");

  return (
    <span
      role="timer"
      className={`rounded-full px-4 py-2 text-sm font-bold tabular-nums ${
        secondsLeft <= 10
          ? "animate-pulse bg-red-950 text-red-300"
          : "bg-slate-800 text-yellow-300"
      }`}
    >
      ⏱ {minutes}:{seconds}
    </span>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
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
