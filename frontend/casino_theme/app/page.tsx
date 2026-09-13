"use client";

import { FormEvent, useState } from "react";
import { BlackjackTable } from "./components/blackjackTable";
import { Landing } from "./components/landing";

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoggedIn(true);
  }

  if (isLoggedIn) return <BlackjackTable />;

  return (
    <main className="relative min-h-svh overflow-hidden bg-neutral-950">
      <div className="absolute inset-0" aria-hidden="true">
        <Landing />
      </div>

      <section className="relative z-10 flex min-h-svh items-start justify-center px-6 pt-[44vh]">
        <div className="w-full max-w-md rounded-2xl border border-white/25 bg-white/10 p-8 text-white shadow-2xl backdrop-blur-xl">
          <p className="text-center text-xs uppercase tracking-[0.3em] text-amber-300">Welcome back</p>
          <h1 className="mt-3 text-center font-serif text-4xl font-bold text-amber-400">Enter ze Table</h1>

          <form onSubmit={handleLogin} className="mt-8 space-y-5">
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
            <label className="block text-sm text-white/80">
              Password
              <input
                required
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-2 w-full rounded-lg border border-white/15 bg-white/10 px-4 py-3 text-white outline-none placeholder:text-white/35 focus:border-amber-300/70"
                placeholder="Enter your password"
              />
            </label>
            <button type="submit" className="w-full rounded-lg bg-amber-400 px-4 py-3 font-semibold text-neutral-950 transition-colors hover:bg-amber-300">
              Log in
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}