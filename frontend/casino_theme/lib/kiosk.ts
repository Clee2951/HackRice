/**
 * Typed view of the Electron bridge exposed by `frontend/preload.js`.
 *
 * The same Next.js app runs in two places — inside the Electron kiosk, and
 * in a plain browser during development — so every one of these is
 * optional at runtime. `kiosk()` returns null in the browser, and callers
 * are expected to degrade rather than break: the browser's own file input
 * stands in for the native picker, and Presage capture simply doesn't run
 * (it needs a Node process with the SmartSpectra SDK, which a web page
 * cannot host).
 */

import { useSyncExternalStore } from "react";

export type PresageStatus = "idle" | "starting" | "running" | "stopped" | "error";

/** A line of interest from the Presage capture process.
 *
 * Deliberately coarse: the capture script owns the actual stress analysis
 * (presage/stress.mjs) and reports its verdict to the backend directly, so
 * the UI only needs enough to tell the user what's happening. */
export type PresageEvent =
  | { type: "status"; status: PresageStatus; message?: string }
  | { type: "drowsiness"; message: string }
  | { type: "summary"; extendBreak: boolean; extraBreakMinutes: number };

export type KioskAPI = {
  getConfig: () => Promise<{
    requiresPin: boolean;
    backendUrl: string;
    hasPresageKey: boolean;
    /** False when launched with --no-kiosk; setLockdown becomes a no-op. */
    lockdownAvailable: boolean;
  }>;
  /** Engage or release full-screen lockdown.
   *
   * Idempotent and safe to call on every phase change. The emergency exit
   * shortcut and the injected exit button stay available throughout --
   * they are registered at startup, not alongside lockdown. */
  setLockdown: (on: boolean) => Promise<{ lockedDown: boolean; reason?: string }>;
  requestExit: (pin?: string) => Promise<{ success: boolean; message?: string }>;
  pickFile: () => Promise<{
    canceled: boolean;
    filePath?: string;
    fileName?: string;
    /** File contents, so the renderer can build a File and upload it
     * through the ordinary authenticated API path rather than needing a
     * second, unauthenticated upload route in the main process. */
    data?: ArrayBuffer;
  }>;
  startPresage: (options: {
    sessionId: number;
    token: string;
    sectionMinutes: number;
    breakSeconds: number;
  }) => Promise<{ started: boolean; message?: string }>;
  stopPresage: () => Promise<{ stopped: boolean }>;
  onPresageEvent: (handler: (event: PresageEvent) => void) => () => void;
};

declare global {
  interface Window {
    kioskAPI?: KioskAPI;
  }
}

/** The bridge, or null when not running inside Electron. */
export function kiosk(): KioskAPI | null {
  if (typeof window === "undefined") return null;
  return window.kioskAPI ?? null;
}

export function inKiosk(): boolean {
  return kiosk() !== null;
}

// Whether the bridge exists is a fact about the environment, not React
// state, and it is false during server rendering. useSyncExternalStore is
// how a component reads that without copying it into state from an effect.
const noopSubscribe = () => () => {};
const bridgePresent = () => kiosk() !== null;
const notPresent = () => false;

export function useInKiosk(): boolean {
  return useSyncExternalStore(noopSubscribe, bridgePresent, notPresent);
}
