"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  DocumentDetail,
  Phase,
  StudySession,
  WellbeingReading,
  advanceSession,
  completeSession,
  formatClock,
  getDocument,
  getSession,
  getToken,
  getWellbeing,
  logout,
  pauseSession,
  remainingSeconds,
  resumeSession,
} from "@/lib/api";
import { kiosk } from "@/lib/kiosk";
import { DocumentPane } from "./documentPane";
import { TutorChat } from "./tutorChat";
import { RecallPanel } from "./recallPanel";
import { FeedbackPanel } from "./feedbackPanel";
import { WellbeingPanel } from "./wellbeingPanel";

/** Phases that run against a server-held deadline. The others
 * (recall, feedback) wait on the student, not a clock. */
const TIMED: ReadonlySet<Phase> = new Set<Phase>(["study", "review", "break"]);

/** Phases where the source document is allowed to be on screen.
 *
 * Recall deliberately hides it: an open textbook turns "what do you
 * remember" into "what can you copy", which is the one thing active recall
 * is for. The backend enforces the same idea from its side by refusing
 * tutoring and hiding attempt history during recall. */
const CAN_READ: ReadonlySet<Phase> = new Set<Phase>(["study", "review", "break", "feedback"]);

const PHASE_TITLE: Record<Phase, string> = {
  study: "Study session",
  review: "Review round",
  recall: "Show your hand",
  feedback: "The house reveals",
  break: "Break time",
  completed: "Session complete",
};

const PHASE_BLURB: Record<Phase, string> = {
  study: "Read. Ask the dealer anything you like.",
  review: "Back in. Focus on what you missed last round.",
  recall: "Close the book. Write down everything you remember.",
  feedback: "What you knew, and what you missed.",
  break: "Step away from the screen.",
  completed: "Nice work. Cash out or deal another hand.",
};

/** How often to re-read the session from the server.
 *
 * The countdown runs locally between polls; this exists to catch changes
 * this tab didn't make (a break extended by a wellbeing report, a session
 * driven from another window) and to re-anchor against server time. */
const POLL_MS = 20_000;

export function StudyRoom({ sessionId }: { sessionId: number }) {
  const router = useRouter();
  const [session, setSession] = useState<StudySession | null>(null);
  const [document, setDocument] = useState<DocumentDetail | null>(null);
  const [wellbeing, setWellbeing] = useState<WellbeingReading[]>([]);
  const [seconds, setSeconds] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Guards the auto-advance in the ticking effect: without it, every tick
  // after the deadline fires another POST, and the backend answers the
  // second one with a 409 for a phase that already moved on.
  const advancing = useRef(false);

  const handleFailure = useCallback(
    (cause: unknown) => {
      if (cause instanceof ApiError && cause.status === 401) {
        logout();
        router.replace("/");
        return;
      }
      setError(cause instanceof ApiError ? cause.message : "Something went wrong.");
    },
    [router],
  );

  /** Adopt a session snapshot and reset the local countdown to match it. */
  const adopt = useCallback((next: StudySession) => {
    setSession(next);
    setSeconds(remainingSeconds(next));
    setError("");
  }, []);

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const loaded = await getSession(sessionId);
        if (cancelled) return;
        adopt(loaded);
        const [detail, readings] = await Promise.all([
          getDocument(loaded.document_id),
          getWellbeing(sessionId).catch(() => [] as WellbeingReading[]),
        ]);
        if (cancelled) return;
        setDocument(detail);
        setWellbeing(readings);
      } catch (cause) {
        if (!cancelled) handleFailure(cause);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [sessionId, adopt, handleFailure]);

  // Periodic resync.
  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const fresh = await getSession(sessionId);
        setSession((current) => {
          // Don't clobber a phase change this tab just made and is still
          // rendering around; the next poll will agree soon enough.
          if (current && advancing.current) return current;
          setSeconds(remainingSeconds(fresh));
          return fresh;
        });
      } catch {
        // A blip shouldn't tear down a running session -- the local
        // countdown carries on and the next poll retries.
      }
    }, POLL_MS);
    return () => clearInterval(poll);
  }, [sessionId]);

  const advance = useCallback(async () => {
    if (advancing.current) return;
    advancing.current = true;
    setBusy(true);
    try {
      const next = await advanceSession(sessionId);
      adopt(next);
      if (next.phase === "break" || next.phase === "feedback") {
        // A wellbeing report only lands after a study/review timer ends,
        // and the break extension is applied on the way into "break" --
        // so this is the moment the numbers become worth showing.
        setWellbeing(await getWellbeing(sessionId).catch(() => wellbeing));
      }
    } catch (cause) {
      // A 409 here means the server disagrees about the phase or the
      // timer; re-reading is more useful than showing the message.
      if (cause instanceof ApiError && cause.status === 409) {
        try {
          adopt(await getSession(sessionId));
        } catch (reloadCause) {
          handleFailure(reloadCause);
        }
      } else {
        handleFailure(cause);
      }
    } finally {
      advancing.current = false;
      setBusy(false);
    }
  }, [sessionId, adopt, handleFailure, wellbeing]);

  // Local countdown + auto-advance at zero.
  useEffect(() => {
    if (!session || session.paused || !TIMED.has(session.phase)) return;
    const tick = setInterval(() => {
      const left = remainingSeconds(session);
      setSeconds(left);
      if (left !== null && left <= 0) void advance();
    }, 500);
    return () => clearInterval(tick);
  }, [session, advance]);

  // ---------------------------------------------------------------------
  // Presage capture, driven by the phase
  // ---------------------------------------------------------------------
  // Capture runs only during a timed reading phase: that's the window the
  // stress summary is meant to describe, and it's what the backend keys a
  // wellbeing report to (sessions.py rejects one outside an active round).
  // Browser-only runs simply skip this -- the SmartSpectra SDK needs a
  // Node process, which a web page can't host.
  const capturing = Boolean(session && !session.paused && (session.phase === "study" || session.phase === "review"));
  const round = session?.round_number;

  useEffect(() => {
    const bridge = kiosk();
    if (!bridge || !capturing || !session) return;
    const token = getToken();
    if (!token) return;
    let stopped = false;
    void bridge
      .startPresage({
        sessionId,
        token,
        // Kept in sync with this phase's own length so the capture window
        // and the backend's timer describe the same stretch of time.
        sectionMinutes: Math.max(1, Math.round((seconds ?? session.study_seconds) / 60)),
        breakSeconds: session.break_seconds,
      })
      .catch(() => {
        // Capture is an enhancement; a missing API key or SDK shouldn't
        // stop anyone studying. WellbeingPanel reports the status.
      });
    return () => {
      if (stopped) return;
      stopped = true;
      void bridge.stopPresage().catch(() => {});
    };
    // `seconds` is deliberately not a dependency: it changes every tick and
    // would restart capture once a second. Round + phase is the real edge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturing, round, sessionId]);

  async function togglePause() {
    if (!session) return;
    setBusy(true);
    try {
      adopt(session.paused ? await resumeSession(sessionId) : await pauseSession(sessionId));
    } catch (cause) {
      handleFailure(cause);
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setBusy(true);
    try {
      adopt(await completeSession(sessionId));
    } catch (cause) {
      handleFailure(cause);
    } finally {
      setBusy(false);
    }
  }

  if (!session) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-neutral-950 text-white/60">
        {error ? <p role="alert">{error}</p> : <p>Taking a seat...</p>}
      </main>
    );
  }

  const phase = session.phase;
  const showDocument = CAN_READ.has(phase);
  const currentReading = wellbeing.find((reading) => reading.round_number === session.round_number);

  return (
    <main className="relative min-h-svh overflow-hidden bg-neutral-950 text-white">
      <div
        className="absolute inset-0 bg-radial from-green-900 from-40% to-neutral-950 to-100% opacity-60"
        aria-hidden="true"
      />

      <div className="relative z-10 grid min-h-svh grid-cols-1 gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(380px,460px)]">
        {/* ---- Left: the document, or the recall desk ---- */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/15 bg-neutral-900/90 shadow-2xl">
          <header className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.25em] text-amber-300">
                Round {session.round_number} &middot; {PHASE_TITLE[phase]}
              </p>
              <h1 className="mt-1 truncate text-lg font-semibold">
                {document?.title ?? "Loading document..."}
              </h1>
            </div>
            <button
              type="button"
              onClick={() => router.push("/")}
              className="shrink-0 rounded-full border border-white/20 px-3 py-1 text-xs text-white/70 hover:text-white"
            >
              Back to table
            </button>
          </header>

          {phase === "recall" ? (
            <RecallPanel
              // Forces a fresh mount per round, which is what guarantees a
              // new recall submission id (see RecallPanel).
              key={session.round_number}
              sessionId={sessionId}
              roundNumber={session.round_number}
              objectives={(document?.objectives ?? []).filter((objective) =>
                session.objective_ids.includes(objective.id),
              )}
              onAssessed={async () => {
                // submitRecall() moves the session to "feedback" server-side
                // and stores the lesson on it, so re-reading is what brings
                // both across rather than patching state by hand.
                try {
                  adopt(await getSession(sessionId));
                } catch (cause) {
                  handleFailure(cause);
                }
              }}
              onError={handleFailure}
            />
          ) : showDocument ? (
            <DocumentPane documentId={session.document_id} onError={handleFailure} />
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-center text-white/50">
              <p>{PHASE_BLURB[phase]}</p>
            </div>
          )}
        </section>

        {/* ---- Right: timer, wellbeing, tutor / feedback ---- */}
        <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto">
          <section className="rounded-2xl border border-white/15 bg-neutral-900/85 p-5 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.25em] text-amber-300">Focus cycle</p>
                <h2 className="mt-1 text-xl font-semibold">{PHASE_TITLE[phase]}</h2>
                <p className="mt-1 text-sm text-white/50">{PHASE_BLURB[phase]}</p>
              </div>
              <span className="shrink-0 font-mono text-3xl text-amber-200">
                {TIMED.has(phase) ? formatClock(seconds) : "--:--"}
              </span>
            </div>

            {currentReading?.extend_break && phase === "break" && (
              <p className="mt-4 rounded-lg border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">
                The camera saw sustained stress last round — this break is{" "}
                {currentReading.extra_break_minutes} min longer.
              </p>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              {TIMED.has(phase) && (
                <button
                  type="button"
                  onClick={togglePause}
                  disabled={busy}
                  className="rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-neutral-950 disabled:opacity-60"
                >
                  {session.paused ? "Resume" : "Pause"}
                </button>
              )}
              {TIMED.has(phase) && !session.paused && (
                <button
                  type="button"
                  onClick={advance}
                  disabled={busy}
                  className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white/80 disabled:opacity-60"
                >
                  {phase === "break" ? "Skip break" : "I'm done early"}
                </button>
              )}
              {phase !== "completed" && (
                <button
                  type="button"
                  onClick={finish}
                  disabled={busy}
                  className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white/60 disabled:opacity-60"
                >
                  End session
                </button>
              )}
              {phase === "completed" && (
                <button
                  type="button"
                  onClick={() => router.push("/")}
                  className="rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-neutral-950"
                >
                  Back to the table
                </button>
              )}
            </div>

            {error && (
              <p role="alert" className="mt-4 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {error}
              </p>
            )}
          </section>

          <WellbeingPanel active={capturing} reading={currentReading} />

          {phase === "feedback" ? (
            <FeedbackPanel
              session={session}
              objectives={document?.objectives ?? []}
              onBreak={advance}
              busy={busy}
            />
          ) : (
            <TutorChat
              sessionId={sessionId}
              // The backend refuses tutoring outside a running study/review
              // timer, so the input is disabled rather than left inviting a
              // guaranteed 409.
              enabled={(phase === "study" || phase === "review") && !session.paused && (seconds ?? 0) > 0}
              phase={phase}
              onError={handleFailure}
            />
          )}
        </aside>
      </div>
    </main>
  );
}
