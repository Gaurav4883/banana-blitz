// AI-assisted (Claude, Anthropic): sign in / guest screen, reviewed by me.
"use client";

import { useState } from "react";
import { authApi, type User } from "@/lib/api";

type Mode = "guest" | "login" | "register";

interface AuthPanelProps {
  onSignedIn: (user: User) => void;
  initialMode?: Mode;
  // when a guest is saving their progress we skip the guest tab
  upgradingGuest?: User | null;
  onCancel?: () => void;
}

const tabs: { mode: Mode; label: string }[] = [
  { mode: "guest", label: "Play as guest" },
  { mode: "login", label: "Sign in" },
  { mode: "register", label: "Create account" },
];

export default function AuthPanel({
  onSignedIn,
  initialMode = "guest",
  upgradingGuest = null,
  onCancel,
}: AuthPanelProps) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [displayName, setDisplayName] = useState(
    upgradingGuest?.displayName ?? "",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const user =
        mode === "guest"
          ? await authApi.guest(displayName)
          : mode === "login"
            ? await authApi.login(email, password)
            : await authApi.register({ displayName, email, password });

      onSignedIn(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const visibleTabs = upgradingGuest
    ? tabs.filter((tab) => tab.mode === "register")
    : tabs;

  const inputClass =
    "w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-yellow-400";

  return (
    <div className="py-6">
      <h2 className="text-center text-2xl font-bold">
        {upgradingGuest ? "Save your progress" : "Who's playing?"}
      </h2>
      <p className="mt-2 text-center text-sm text-slate-400">
        {upgradingGuest
          ? "Add an email and password to keep this player."
          : "Jump in as a guest, or sign in to keep your scores."}
      </p>

      {visibleTabs.length > 1 && (
        <div className="mt-6 grid grid-cols-3 gap-1 rounded-xl bg-slate-950 p-1">
          {visibleTabs.map((tab) => (
            <button
              key={tab.mode}
              type="button"
              onClick={() => {
                setMode(tab.mode);
                setError("");
              }}
              className={`rounded-lg px-2 py-2 text-xs font-semibold transition sm:text-sm ${
                mode === tab.mode
                  ? "bg-yellow-400 text-slate-950"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="mt-6 space-y-3">
        {mode !== "login" && (
          <div>
            <label htmlFor="displayName" className="mb-1 block text-sm text-slate-300">
              Display name
            </label>
            <input
              id="displayName"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="e.g. BananaBoss"
              minLength={2}
              maxLength={20}
              required
              className={inputClass}
            />
          </div>
        )}

        {mode !== "guest" && (
          <>
            <div>
              <label htmlFor="email" className="mb-1 block text-sm text-slate-300">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1 block text-sm text-slate-300">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={mode === "register" ? 8 : undefined}
                maxLength={128}
                required
                className={inputClass}
              />
              {mode === "register" && (
                <p className="mt-1 text-xs text-slate-500">At least 8 characters.</p>
              )}
            </div>
          </>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-800 bg-red-950/40 p-3 text-sm text-red-300"
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-yellow-400 px-6 py-3 font-bold text-slate-950 transition hover:bg-yellow-300 disabled:opacity-50"
        >
          {busy
            ? "Please wait..."
            : mode === "guest"
              ? "Start playing"
              : mode === "login"
                ? "Sign in"
                : "Create account"}
        </button>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="w-full rounded-xl border border-slate-700 px-6 py-3 text-sm text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </button>
        )}
      </form>
    </div>
  );
}
