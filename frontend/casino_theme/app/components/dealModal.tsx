"use client"

import { useCallback, useEffect, useState } from "react"
import {
  DocumentDetail,
  DocumentSummary,
  ObjectiveStatus,
  StudySession,
  createSession,
  getDocument,
  listSessions,
} from "@/lib/api"

/** The backend caps a session at five objectives (SessionCreate's
 * objective_ids has max_length=5), and picking fewer is the point of
 * active recall anyway — a round you can actually finish. */
const MAX_OBJECTIVES = 5

const DEFAULT_STUDY_MINUTES = 15
const DEFAULT_BREAK_MINUTES = 5

const STATUS_STYLE: Record<ObjectiveStatus, { label: string; className: string }> = {
  correct: { label: "Solid", className: "border-emerald-400/50 text-emerald-300" },
  partial: { label: "Shaky", className: "border-amber-400/50 text-amber-300" },
  incorrect: { label: "Misread", className: "border-red-400/50 text-red-300" },
  not_demonstrated: { label: "Untouched", className: "border-white/25 text-white/50" },
}

export function DealModal({
  document,
  onClose,
  onStarted,
  onError,
}: {
  document: DocumentSummary
  onClose: () => void
  onStarted: (sessionId: number) => void
  onError: (cause: unknown) => void
}) {
  const [detail, setDetail] = useState<DocumentDetail | null>(null)
  const [resumable, setResumable] = useState<StudySession[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [studyMinutes, setStudyMinutes] = useState(DEFAULT_STUDY_MINUTES)
  const [breakMinutes, setBreakMinutes] = useState(DEFAULT_BREAK_MINUTES)
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [loaded, sessions] = await Promise.all([
          getDocument(document.id),
          listSessions(document.id),
        ])
        if (cancelled) return
        setDetail(loaded)
        setResumable(sessions.filter((session) => session.phase !== "completed"))
        // Pre-select the objectives least well known, so the default round
        // targets what the progress map says is weakest rather than just
        // the first few in the document.
        const ranked = [...loaded.objectives].sort(
          (a, b) => weakness(loaded, b.id) - weakness(loaded, a.id),
        )
        setSelected(ranked.slice(0, MAX_OBJECTIVES).map((objective) => objective.id))
      } catch (cause) {
        if (!cancelled) onError(cause)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [document.id, onError])

  const toggle = useCallback((id: string) => {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : current.length >= MAX_OBJECTIVES
          ? current
          : [...current, id],
    )
  }, [])

  async function deal() {
    setStarting(true)
    try {
      const session = await createSession({
        document_id: document.id,
        objective_ids: selected,
        study_seconds: Math.round(studyMinutes * 60),
        break_seconds: Math.round(breakMinutes * 60),
      })
      onStarted(session.id)
    } catch (cause) {
      onError(cause)
      setStarting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="max-h-[88svh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-gold/40 bg-neutral-900 p-6 text-white shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-amber-300">Deal a hand</p>
            <h2 className="mt-1 font-serif text-2xl text-gold">{document.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/20 px-3 py-1 text-sm text-white/70 hover:text-white"
          >
            Close
          </button>
        </div>

        {!detail ? (
          <p className="mt-8 text-center text-sm text-white/50">Reading the table...</p>
        ) : (
          <>
            {resumable.length > 0 && (
              <section className="mt-6 rounded-xl border border-amber-300/30 bg-amber-300/5 p-4">
                <h3 className="text-sm font-semibold text-amber-200">Unfinished hands</h3>
                <ul className="mt-3 space-y-2">
                  {resumable.map((session) => (
                    <li key={session.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-white/70">
                        Round {session.round_number} &middot; {session.phase}
                        {session.paused && " (paused)"}
                      </span>
                      <button
                        type="button"
                        onClick={() => onStarted(session.id)}
                        className="rounded-full border border-amber-300/50 px-3 py-1 text-xs text-amber-200 hover:bg-amber-300/10"
                      >
                        Resume
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="mt-6">
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-semibold text-white/80">
                  What are we drilling?
                </h3>
                <span className="text-xs text-white/45">
                  {selected.length}/{MAX_OBJECTIVES} picked
                </span>
              </div>
              <ul className="mt-3 space-y-2">
                {detail.objectives.map((objective) => {
                  const checked = selected.includes(objective.id)
                  const status = detail.progress[objective.id]?.status ?? "not_demonstrated"
                  const style = STATUS_STYLE[status]
                  return (
                    <li key={objective.id}>
                      <label
                        className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 transition-colors ${
                          checked
                            ? "border-amber-300/60 bg-amber-300/10"
                            : "border-white/10 bg-white/5 hover:border-white/25"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(objective.id)}
                          // Stops a sixth box from looking clickable when
                          // the backend would reject the request anyway.
                          disabled={!checked && selected.length >= MAX_OBJECTIVES}
                          className="mt-1 accent-amber-400"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm text-white/90">{objective.title}</span>
                          <span className="mt-0.5 block text-xs text-white/45">
                            {objective.expected_points.length} key point
                            {objective.expected_points.length === 1 ? "" : "s"}
                            {objective.source_pages.length > 0 &&
                              ` · p.${objective.source_pages.join(", ")}`}
                          </span>
                        </span>
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${style.className}`}>
                          {style.label}
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </section>

            <section className="mt-6 grid grid-cols-2 gap-4">
              <label className="text-sm text-white/70">
                Study minutes
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={studyMinutes}
                  onChange={(event) => setStudyMinutes(Number(event.target.value))}
                  className="mt-2 w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-white outline-none focus:border-amber-300/70"
                />
              </label>
              <label className="text-sm text-white/70">
                Break minutes
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={breakMinutes}
                  onChange={(event) => setBreakMinutes(Number(event.target.value))}
                  className="mt-2 w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-white outline-none focus:border-amber-300/70"
                />
              </label>
            </section>
            <p className="mt-2 text-xs text-white/40">
              Recall isn&apos;t on a clock — you dump what you remember and submit when
              you&apos;re done. Breaks get longer on their own if the camera sees you
              struggling.
            </p>

            <button
              type="button"
              onClick={deal}
              disabled={starting || selected.length === 0 || studyMinutes < 1 || breakMinutes < 1}
              className="mt-6 w-full rounded-lg bg-amber-400 px-4 py-3 font-semibold text-neutral-950
              transition-colors hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {starting ? "Dealing..." : "Deal me in"}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/** Higher means "needs work more". Drives the default objective picks. */
function weakness(detail: DocumentDetail, objectiveId: string): number {
  const entry = detail.progress[objectiveId]
  if (!entry) return 3 // never attempted — the most interesting thing to drill
  switch (entry.status) {
    case "incorrect":
      return 4
    case "partial":
      return 2
    case "not_demonstrated":
      return 3
    case "correct":
      return 0
  }
}
