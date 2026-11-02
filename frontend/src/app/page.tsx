"use client";

import { useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface HealthResponse {
  success: boolean;
  message: string;
  data: {
    service: string;
    status: string;
  };
}

export default function Home() {
  const [result, setResult] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function checkBackend() {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(`${API_URL}/api/v1/health`);

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const data: HealthResponse = await response.json();

      setResult(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to connect to the backend",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-950 px-6 text-white">
      <div className="text-center">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-amber-400">
          Puzzle Arena
        </p>

        <h1 className="text-5xl font-extrabold tracking-tight">Banana Blitz</h1>

        <p className="mt-4 max-w-md text-slate-300">
          Your puzzle adventure starts here. Let&apos;s connect to the game server.
        </p>
      </div>

      <button
        type="button"
        onClick={checkBackend}
        disabled={loading}
        className="rounded-xl bg-amber-400 px-6 py-3 font-bold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Connecting..." : "Check Game Server"}
      </button>

      {result && (
        <section className="w-full max-w-md rounded-xl border border-emerald-500/40 bg-emerald-950/40 p-5">
          <h2 className="font-bold text-emerald-300">Connection successful</h2>

          <p className="mt-2 text-sm text-slate-200">{result.message}</p>

          <p className="mt-2 text-sm text-slate-400">
            Service: {result.data.service}
          </p>

          <p className="text-sm text-slate-400">Status: {result.data.status}</p>
        </section>
      )}

      {error && (
        <section
          role="alert"
          className="w-full max-w-md rounded-xl border border-red-500/40 bg-red-950/40 p-5"
        >
          <h2 className="font-bold text-red-300">Connection failed</h2>

          <p className="mt-2 break-words text-sm text-slate-200">{error}</p>

          <p className="mt-2 text-sm text-slate-400">
            Check that the backend is running on port 4000.
          </p>
        </section>
      )}
    </main>
  );
}
