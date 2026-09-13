"use client";

import { useEffect, useRef, useState } from "react";
import { Objective, submitRecall } from "@/lib/api";

/**
 * The brain dump. Round N's "what do you actually remember" step.
 *
 * The source document is not on screen while this is up (see StudyRoom's
 * CAN_READ set) — that's the whole point of the phase.
 */
export function RecallPanel({
  sessionId,
  objectives,
  onAssessed,
  onError,
}: {
  sessionId: number;
  objectives: Objective[];
  onAssessed: () => void | Promise<void>;
  onError: (cause: unknown) => void;
}) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  /** One id per mount, which is one id per round.
   *
   * The backend keys recall idempotency on this: resubmitting the same id
   * with the same text returns the stored assessment instead of spending
   * another Gemini call, which is what makes a retry after a timeout safe.
   * Regenerating it per render (or per click) would defeat that and hit
   * the round's uniqueness constraint instead. StudyRoom keys this
   * component on roundNumber, so round 2 is guaranteed a fresh mount and
   * therefore a fresh id. */
  const [submissionId] = useState(() => crypto.randomUUID());

  useEffect(() => {
    areaRef.current?.focus();
  }, []);

  async function submit() {
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    try {
      await submitRecall(sessionId, submissionId, text.trim());
      await onAssessed();
    } catch (cause) {
      onError(cause);
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col p-5">
      <div className="mb-3">
        <h2 className="font-serif text-2xl text-amber-300">Show your hand</h2>
        <p className="mt-1 text-sm text-white/60">
          Book&apos;s closed. Write down everything you remember — messy is fine, the
          dealer only cares what&apos;s in your head.
        </p>
      </div>

      {objectives.length > 0 && (
        <div className="mb-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-xs uppercase tracking-[0.2em] text-amber-300/80">This round covers</p>
          <ul className="mt-2 space-y-1 text-sm text-white/70">
            {objectives.map((objective) => (
              <li key={objective.id}>&middot; {objective.title}</li>
            ))}
          </ul>
          {/* Titles only, never expected_points -- listing the points the
              assessment is about to look for would hand over the answers. */}
        </div>
      )}

      <textarea
        ref={areaRef}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void submit();
        }}
        maxLength={12000}
        disabled={submitting}
        placeholder="Everything you can remember about the concepts above..."
        className="min-h-0 flex-1 resize-none rounded-xl border border-white/15 bg-neutral-950/80 p-4
        text-sm leading-relaxed text-white outline-none placeholder:text-white/25 focus:border-amber-300/60
        disabled:opacity-60"
      />

      <div className="mt-3 flex items-center justify-between gap-4">
        <span className="text-xs text-white/35">
          {text.length.toLocaleString()} / 12,000 &middot; {navigatorHint()} + Enter to submit
        </span>
        <button
          type="button"
          onClick={submit}
          disabled={submitting || !text.trim()}
          className="rounded-lg bg-amber-400 px-5 py-2.5 text-sm font-semibold text-neutral-950
          transition-colors hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "The house is checking..." : "Lay it down"}
        </button>
      </div>
    </div>
  );
}

function navigatorHint(): string {
  if (typeof navigator === "undefined") return "Ctrl";
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "Cmd" : "Ctrl";
}
