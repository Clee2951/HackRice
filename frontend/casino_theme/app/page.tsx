"use client";

import { FormEvent, useState } from "react";
import { BlackjackTable } from "./components/blackjackTable";
import { Landing } from "./components/landing";
import { ApiError, login, logout, signup, useHydrated, useToken } from "@/lib/api";

type Mode = "login" | "signup";

export default function Home() {
  // Read straight from the token store rather than mirroring it into state
  // inside an effect. `hydrated` separates "localStorage not readable yet"
  // from "genuinely logged out", so the login card doesn't flash in front
  // of someone who is already signed in.
  const token = useToken();
  const hydrated = useHydrated();

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "signup") {
        // users.username is NOT NULL and unique in the schema, but asking
        // for it separately is one more field between someone and the
        // demo — default it to the email's local part and let them change
        // it only if they want to.
        await signup(email, username.trim() || email.split("@")[0], password);
      }
      // login() writes the token to the store, which re-renders this
      // component through useToken() -- nothing to assign here.
      await login(email, password);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function handleLogout() {
    logout();
    setPassword("");
  }

  if (!hydrated) return <main className="min-h-svh bg-neutral-950" />;
  if (token) return <BlackjackTable onLogout={handleLogout} />;

  return (
    <main className="relative min-h-svh overflow-hidden bg-neutral-950">
      <div className="absolute inset-0" aria-hidden="true">
        <Landing />
      </div>

      <section className="relative z-10 flex min-h-svh items-start justify-center px-6 pt-[38vh]">
        <div className="w-full max-w-md rounded-2xl border border-white/25 bg-white/10 p-8 text-white shadow-2xl backdrop-blur-xl">
          <p className="text-center text-xs uppercase tracking-[0.3em] text-amber-300">
            {mode === "login" ? "Welcome back" : "Join the table"}
          </p>
          <h1 className="mt-3 text-center font-serif text-4xl font-bold text-amber-400">Enter the Table</h1>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <label className="block text-sm text-white/80">
              Email
              <input
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-2 w-full rounded-lg border border-white/15 bg-white/10 px-4 py-3 text-white outline-none placeholder:text-white/35 focus:border-amber-300/70"
                placeholder="you@example.com"
              />
            </label>

            {mode === "signup" && (
              <label className="block text-sm text-white/80">
                Display name <span className="text-white/40">(optional)</span>
                <input
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-white/15 bg-white/10 px-4 py-3 text-white outline-none placeholder:text-white/35 focus:border-amber-300/70"
                  placeholder={email ? email.split("@")[0] : "high-roller"}
                />
              </label>
            )}

            <label className="block text-sm text-white/80">
              Password
              <input
                required
                minLength={8}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-2 w-full rounded-lg border border-white/15 bg-white/10 px-4 py-3 text-white outline-none placeholder:text-white/35 focus:border-amber-300/70"
                placeholder={mode === "signup" ? "At least 8 characters" : "Enter your password"}
              />
            </label>

            {error && (
              <p role="alert" className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-amber-400 px-4 py-3 font-semibold text-neutral-950 transition-colors hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "One moment..." : mode === "login" ? "Log in" : "Create account"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setError("");
            }}
            className="mt-5 w-full text-center text-sm text-white/60 underline-offset-4 hover:text-amber-300 hover:underline"
          >
            {mode === "login" ? "No account yet? Sign up" : "Already have an account? Log in"}
          </button>
        </div>
      </section>
    </main>
  );
}
