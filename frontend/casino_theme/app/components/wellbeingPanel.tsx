"use client";

import { useEffect, useState } from "react";
import { WellbeingReading } from "@/lib/api";
import { PresageEvent, PresageStatus, kiosk, useInKiosk } from "@/lib/kiosk";

/**
 * Live status of the Presage/SmartSpectra camera capture, plus last round's
 * verdict.
 *
 * Capture itself runs in the Electron main process (`presage/session.mjs`,
 * a Node script using the SmartSpectra SDK) — a web page can't host it, so
 * in a plain browser this panel says so rather than pretending. The actual
 * stress analysis and the break-extension decision belong to that script
 * and the backend; this only reports.
 *
 * The honesty note from `docs/presage-notes.md` applies to what's shown
 * here: these are heuristics over facial-expression confidences and eye
 * openness, not a clinical stress measurement. The wording stays hedged on
 * purpose.
 */

const STATUS_TEXT: Record<PresageStatus, string> = {
  idle: "Camera idle",
  starting: "Starting camera...",
  running: "Reading the room",
  stopped: "Camera stopped",
  error: "Camera unavailable",
};

export function WellbeingPanel({
  active,
  reading,
}: {
  active: boolean;
  reading?: WellbeingReading;
}) {
  const [status, setStatus] = useState<PresageStatus>("idle");
  const [detail, setDetail] = useState("");
  const [alert, setAlert] = useState("");
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const hasBridge = useInKiosk();
  // No Electron bridge means no capture at all, without having to ask.
  const available = hasBridge ? hasKey : false;

  useEffect(() => {
    const bridge = kiosk();
    if (!bridge) return;
    void bridge
      .getConfig()
      .then((config) => setHasKey(config.hasPresageKey))
      .catch(() => setHasKey(false));

    return bridge.onPresageEvent((event: PresageEvent) => {
      if (event.type === "status") {
        setStatus(event.status);
        setDetail(event.message ?? "");
      } else if (event.type === "drowsiness") {
        setAlert(event.message);
        // Clears itself so a single microsleep doesn't leave a permanent
        // banner for the rest of the round.
        window.setTimeout(() => setAlert(""), 12_000);
      }
    });
  }, []);

  return (
    <section className="rounded-2xl border border-white/15 bg-neutral-900/85 p-5 shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.25em] text-amber-300">Wellbeing check</p>
          <h2 className="mt-1 text-xl font-semibold">
            {available === false
              ? "Camera off"
              : active
                ? STATUS_TEXT[status]
                : "Standing by"}
          </h2>
          <p className="mt-1 text-sm text-white/50">
            {available === false
              ? "Runs in the desktop app with a SmartSpectra key set."
              : detail || (active ? "Watching for stress and drowsiness." : "Starts with the next study timer.")}
          </p>
        </div>
        <span
          className={`mt-1 h-3 w-3 shrink-0 rounded-full ${
            active && status === "running"
              ? "animate-pulse bg-emerald-400"
              : status === "error"
                ? "bg-red-400"
                : "bg-white/25"
          }`}
          aria-hidden="true"
        />
      </div>

      {alert && (
        <p role="alert" className="mt-4 rounded-lg border border-red-400/50 bg-red-500/15 px-3 py-2 text-sm text-red-100">
          {alert}
        </p>
      )}

      {reading && (
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <Stat
            label="Avg stress"
            value={reading.avg_stress === null ? "—" : `${reading.avg_stress.toFixed(0)}/100`}
          />
          <Stat
            label="High-stress time"
            value={reading.pct_high_stress === null ? "—" : `${reading.pct_high_stress.toFixed(0)}%`}
          />
          <Stat
            label="Blink rate"
            value={reading.blink_rate_per_min === null ? "—" : `${reading.blink_rate_per_min.toFixed(0)}/min`}
          />
          <Stat label="Drowsy alerts" value={String(reading.drowsiness_alert_count)} />
        </dl>
      )}

      {reading?.extend_break && (
        <p className="mt-3 text-sm text-amber-200/90">
          Break extended by {reading.extra_break_minutes} min.
        </p>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
      <dt className="text-xs uppercase tracking-wide text-white/40">{label}</dt>
      <dd className="mt-0.5 font-mono text-base text-amber-200">{value}</dd>
    </div>
  );
}
