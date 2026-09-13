"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { BlackjackTable } from "./blackjackTable";

type PdfDocument = {
  title: string;
  src: string;
};

const DEFAULT_DOCUMENT: PdfDocument = {
  title: "Selected study document",
  src: "/documents/selected.pdf",
};

const STUDY_SECONDS = 25 * 60;
const BREAK_SECONDS = 5 * 60;

export function PdfRead({ document = DEFAULT_DOCUMENT }: { document?: PdfDocument }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [secondsLeft, setSecondsLeft] = useState(STUDY_SECONDS);
  const [isStudySession, setIsStudySession] = useState(true);
  const [isRunning, setIsRunning] = useState(true);
  const [cameraStatus, setCameraStatus] = useState("Starting camera...");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let stream: MediaStream | undefined;

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraStatus("Camera unavailable");
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCameraStatus("Camera ready");
      } catch {
        setCameraStatus("Camera permission needed");
      }
    }

    startCamera();

    return () => stream?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    if (!isRunning) return;

    const timer = setInterval(() => {
      setSecondsLeft((current) => {
        if (current > 1) return current - 1;
        setIsStudySession((studySession) => !studySession);
        return isStudySession ? BREAK_SECONDS : STUDY_SECONDS;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isRunning, isStudySession]);

  function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
  }

  function resetTimer() {
    setSecondsLeft(isStudySession ? STUDY_SECONDS : BREAK_SECONDS);
    setIsRunning(true);
  }

  const minutes = Math.floor(secondsLeft / 60).toString().padStart(2, "0");
  const seconds = (secondsLeft % 60).toString().padStart(2, "0");

  return (
    <main className="relative min-h-svh overflow-hidden bg-neutral-950 text-white">
      <div className="absolute inset-0 scale-110 opacity-50 blur-xl" aria-hidden="true">
        <BlackjackTable />
      </div>
      <div className="absolute inset-0 bg-black/45" aria-hidden="true" />

      <div className="relative z-10 grid min-h-svh grid-cols-[minmax(0,60vw)_minmax(360px,1fr)] gap-5 p-5">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/15 bg-neutral-900/90 shadow-2xl">
          <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-amber-300">Now studying</p>
              <h1 className="mt-1 text-lg font-semibold">{document.title}</h1>
            </div>
            <span className="rounded-full border border-amber-300/40 px-3 py-1 text-xs text-amber-200">PDF</span>
          </header>
          <iframe title={document.title} src={document.src} className="min-h-0 flex-1 bg-white" />
        </section>

        <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto">
          <section className="rounded-2xl border border-white/15 bg-neutral-900/85 p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-amber-300">Focus cycle</p>
                <h2 className="mt-1 text-xl font-semibold">{isStudySession ? "Study session" : "Break time"}</h2>
              </div>
              <span className="font-mono text-3xl text-amber-200">{minutes}:{seconds}</span>
            </div>
            <div className="mt-5 flex gap-2">
              <button onClick={() => setIsRunning((running) => !running)} className="rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-neutral-950">
                {isRunning ? "Pause" : "Resume"}
              </button>
              <button onClick={resetTimer} className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white/80">Reset</button>
            </div>
          </section>

          <section className="rounded-2xl border border-white/15 bg-neutral-900/85 p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-amber-300">Wellbeing check</p>
                <h2 className="mt-1 text-xl font-semibold">Mood: detecting</h2>
                <p className="mt-1 text-sm text-white/50">{cameraStatus}</p>
              </div>
              <video ref={videoRef} autoPlay muted playsInline className="hidden" aria-hidden="true" />
            </div>
          </section>

          <section className="flex min-h-64 flex-1 flex-col rounded-2xl border border-white/15 bg-neutral-900/85 p-5 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full border-4 border-amber-200 bg-red-700 text-xs font-bold text-white shadow-[inset_0_0_0_2px_#991b1b]">AI</div>
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-amber-300">Study dealer</p>
                <h2 className="text-xl font-semibold">Ask about this document</h2>
              </div>
            </div>
            <div className="flex-1" />
            <form onSubmit={submitMessage} className="mt-5 flex gap-2">
              <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Type a question..." className="min-w-0 flex-1 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm outline-none placeholder:text-white/35 focus:border-amber-300/60" />
              <button type="submit" className="rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-neutral-950">Send</button>
            </form>
          </section>
        </aside>
      </div>
    </main>
  );
}
