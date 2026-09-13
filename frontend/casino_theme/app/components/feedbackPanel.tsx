"use client";

import { useEffect, useState } from "react";
import {
  Objective,
  ObjectiveStatus,
  RecallAttempt,
  StudySession,
  listAttempts,
} from "@/lib/api";
import { Markdown } from "@/lib/markdown";

/**
 * The reveal: what the student demonstrated versus what the document said
 * they should know, plus the follow-up lesson the model wrote from the gap.
 *
 * The lesson arrives on the session itself (study_service.assess_recall
 * stores it there), so it's already in hand. The per-objective breakdown
 * comes from the attempt history, which is only readable once the phase has
 * left recall — hence fetching it here rather than in RecallPanel.
 */

const STATUS: Record<ObjectiveStatus, { label: string; chip: string; dot: string }> = {
  correct: { label: "Nailed it", chip: "border-emerald-400/50 text-emerald-300", dot: "bg-emerald-400" },
  partial: { label: "Half there", chip: "border-amber-400/50 text-amber-300", dot: "bg-amber-400" },
  incorrect: { label: "Off the mark", chip: "border-red-400/50 text-red-300", dot: "bg-red-400" },
  not_demonstrated: { label: "Didn't come up", chip: "border-white/25 text-white/50", dot: "bg-white/30" },
};

export function FeedbackPanel({
  session,
  objectives,
  onBreak,
  busy,
}: {
  session: StudySession;
  objectives: Objective[];
  onBreak: () => void;
  busy: boolean;
}) {
  const [attempt, setAttempt] = useState<RecallAttempt | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const attempts = await listAttempts(session.id);
        if (cancelled) return;
        setAttempt(attempts.find((row) => row.round_number === session.round_number) ?? null);
      } catch {
        // The lesson below is the important half and comes from the
        // session; a missing breakdown shouldn't blank the panel.
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [session.id, session.round_number]);

  const items = attempt?.result.assessment.items ?? [];
  const titleOf = (conceptId: string) =>
    objectives.find((objective) => objective.id === conceptId)?.title ?? conceptId;

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4">
      {items.length > 0 && (
        <div className="rounded-2xl border border-white/15 bg-neutral-900/85 p-5 shadow-xl">
          <p className="text-xs uppercase tracking-[0.25em] text-amber-300">The count</p>
          <h2 className="mt-1 text-xl font-semibold">What you showed</h2>

          {attempt?.result.assessment.summary && (
            <p className="mt-3 text-sm leading-relaxed text-white/70">
              {attempt.result.assessment.summary}
            </p>
          )}

          <ul className="mt-4 space-y-3">
            {items.map((item) => {
              const style = STATUS[item.status];
              return (
                <li key={item.concept_id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-white/90">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${style.dot}`} aria-hidden="true" />
                      <span className="truncate">{titleOf(item.concept_id)}</span>
                    </span>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${style.chip}`}>
                      {style.label}
                    </span>
                  </div>

                  {item.missing_points.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs uppercase tracking-wide text-white/40">Missed</p>
                      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm text-white/65">
                        {item.missing_points.map((point, index) => (
                          <li key={index}>{point}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {item.misconceptions.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs uppercase tracking-wide text-red-300/70">Watch out</p>
                      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm text-red-200/80">
                        {item.misconceptions.map((point, index) => (
                          <li key={index}>{point}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {item.follow_up_question && (
                    <p className="mt-2 text-sm italic text-amber-200/80">{item.follow_up_question}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {session.lesson && (
        <div className="rounded-2xl border border-white/15 bg-neutral-900/85 p-5 shadow-xl">
          <p className="text-xs uppercase tracking-[0.25em] text-amber-300">House lesson</p>
          <Markdown markdown={session.lesson.markdown} className="mt-3 text-sm text-white/75" />

          {session.lesson.check_questions.length > 0 && (
            <div className="mt-4 rounded-lg border border-amber-300/25 bg-amber-300/5 p-3">
              <p className="text-xs uppercase tracking-wide text-amber-200/80">Before the next round</p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-white/70">
                {session.lesson.check_questions.map((question, index) => (
                  <li key={index}>{question}</li>
                ))}
              </ul>
            </div>
          )}

          {session.lesson.source_pages.length > 0 && (
            <p className="mt-3 text-xs text-white/35">
              Drawn from p.{session.lesson.source_pages.join(", ")}
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onBreak}
        disabled={busy}
        className="rounded-lg bg-amber-400 px-4 py-3 font-semibold text-neutral-950
        transition-colors hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Take the break
      </button>
    </section>
  );
}
