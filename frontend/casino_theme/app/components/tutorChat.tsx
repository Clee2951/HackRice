"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ApiError, ChatMessage, Phase, getChatHistory, sendChat } from "@/lib/api";
import { Markdown } from "@/lib/markdown";

/**
 * The dealer: a side tutor grounded in the uploaded document.
 *
 * Only live during a running study/review timer. The backend enforces that
 * (sessions.py 409s outside those phases) specifically so it can't be used
 * to look up answers during recall — this component matches the rule in the
 * UI so the restriction reads as a deliberate rule rather than a failure.
 */
export function TutorChat({
  sessionId,
  enabled,
  phase,
  onError,
}: {
  sessionId: number;
  enabled: boolean;
  phase: Phase;
  onError: (cause: unknown) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [waiting, setWaiting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // History is hidden during recall (the endpoint 409s), so only load it
  // when it's actually readable.
  useEffect(() => {
    if (phase === "recall") return;
    let cancelled = false;
    async function load() {
      try {
        const history = await getChatHistory(sessionId);
        if (!cancelled) setMessages(history);
      } catch (cause) {
        if (!cancelled && !(cause instanceof ApiError && cause.status === 409)) onError(cause);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [sessionId, phase, onError]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, waiting]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = draft.trim();
    if (!question || waiting || !enabled) return;

    // Show the question immediately; the round trip includes a Gemini call
    // and waiting on it before echoing what was typed feels broken.
    setMessages((current) => [...current, { role: "user", content: question }]);
    setDraft("");
    setWaiting(true);
    try {
      const answer = await sendChat(sessionId, question);
      setMessages((current) => [...current, { role: "assistant", content: answer.answer }]);
    } catch (cause) {
      // Roll the optimistic message back so the transcript doesn't keep a
      // question the server never recorded.
      setMessages((current) => current.slice(0, -1));
      setDraft(question);
      onError(cause);
    } finally {
      setWaiting(false);
    }
  }

  return (
    <section className="flex min-h-64 flex-1 flex-col rounded-2xl border border-white/15 bg-neutral-900/85 p-5 shadow-xl">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-4 border-amber-200 bg-red-700 text-xs font-bold text-white shadow-[inset_0_0_0_2px_#991b1b]">
          AI
        </div>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.25em] text-amber-300">Study dealer</p>
          <h2 className="text-xl font-semibold">Ask about this document</h2>
        </div>
      </div>

      <div ref={scrollRef} className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {messages.length === 0 && !waiting && (
          <p className="text-sm text-white/40">
            {enabled
              ? "Stuck on something? Ask — answers are grounded in your own document."
              : "The dealer sits out until the next study timer starts."}
          </p>
        )}

        {messages.map((message, index) => (
          <div
            key={index}
            className={
              message.role === "user"
                ? "ml-auto max-w-[88%] rounded-xl rounded-br-sm bg-amber-300/15 px-3 py-2 text-sm text-white/90"
                : "mr-auto max-w-[92%] rounded-xl rounded-bl-sm border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80"
            }
          >
            {message.role === "assistant" ? (
              <Markdown markdown={message.content} />
            ) : (
              message.content
            )}
          </div>
        ))}

        {waiting && (
          <p className="mr-auto rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/45">
            Checking your notes...
          </p>
        )}
      </div>

      <form onSubmit={submit} className="mt-4 flex gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={!enabled || waiting}
          maxLength={4000}
          placeholder={
            enabled
              ? "Type a question..."
              : phase === "recall"
                ? "No help during recall — that's the point"
                : "Available during study rounds"
          }
          className="min-w-0 flex-1 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm outline-none
          placeholder:text-white/35 focus:border-amber-300/60 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!enabled || waiting || !draft.trim()}
          className="rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-neutral-950 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </section>
  );
}
