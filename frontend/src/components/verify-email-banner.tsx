// AI-assisted (Claude, Anthropic): email verification banner, reviewed by me.
"use client";

import { useState } from "react";
import { authApi, type User } from "@/lib/api";

interface VerifyEmailBannerProps {
  user: User;
  onVerified: (user: User) => void;
}

export default function VerifyEmailBanner({
  user,
  onVerified,
}: VerifyEmailBannerProps) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const verify = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      onVerified(await authApi.verifyEmail(code));
    } catch (err) {
      setIsError(true);
      setMessage(err instanceof Error ? err.message : "Couldn't verify");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    setMessage("");

    try {
      await authApi.resendVerification();
      setIsError(false);
      setMessage("New code sent, check your inbox.");
      setCode("");
    } catch (err) {
      setIsError(true);
      setMessage(err instanceof Error ? err.message : "Couldn't send a code");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-6 rounded-xl border border-yellow-700 bg-yellow-950/30 p-4">
      <p className="text-sm text-yellow-100">
        We sent a 6 digit code to <strong>{user.email}</strong>. Enter it to
        verify your email. (You can keep playing in the meantime.)
      </p>

      <form onSubmit={verify} className="mt-3 flex flex-wrap gap-2">
        <input
          value={code}
          // digits only, max 6
          onChange={(event) =>
            setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
          }
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          aria-label="Verification code"
          className="w-32 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-center tracking-[0.3em] text-white outline-none focus:border-yellow-400"
        />
        <button
          type="submit"
          disabled={busy || code.length !== 6}
          className="rounded-lg bg-yellow-400 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-50"
        >
          Verify
        </button>
        <button
          type="button"
          onClick={() => void resend()}
          disabled={busy}
          className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
        >
          Resend code
        </button>
      </form>

      {message && (
        <p
          role={isError ? "alert" : "status"}
          className={`mt-2 text-sm ${isError ? "text-red-300" : "text-green-300"}`}
        >
          {message}
        </p>
      )}
    </section>
  );
}
