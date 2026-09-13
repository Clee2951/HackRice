import { useSyncExternalStore } from "react";

/**
 * Typed client for the FastAPI backend (`backend/`).
 *
 * Everything the UI knows about the server goes through here, so the
 * request shapes stay in one place and match `backend/schemas/study.py`
 * rather than being rebuilt ad hoc in each component.
 *
 * The backend is a separate origin from Next.js (FastAPI on :8000, Next on
 * :3000), so requests are plain cross-origin fetches with a bearer token —
 * `backend/core/config.py`'s CORS_ORIGINS has to list this app's origin.
 */

/** Where the backend lives.
 *
 * Resolution order matters for the packaged desktop app:
 *
 * 1. `window.studyLoopBackendUrl` — injected by the Electron preload from
 *    the main process. This is the only one that can change *after* the UI
 *    was built, which is what lets one installer point at a different
 *    deployment (see frontend/main.js's resolveBackendUrl).
 * 2. `NEXT_PUBLIC_API_URL` — inlined at build time. Used by `next dev` and
 *    by a browser-hosted build.
 * 3. Localhost, for someone running everything on their own machine.
 *
 * Read once at module load: the preload runs before any page script, so
 * the value is already there, and a getter re-reading it per request would
 * let the base URL change mid-session. */
function resolveApiBase(): string {
  const fromKiosk =
    typeof window !== "undefined"
      ? (window as { studyLoopBackendUrl?: string }).studyLoopBackendUrl
      : undefined;
  const configured = fromKiosk || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
  return configured.replace(/\/$/, "");
}

const API_BASE = resolveApiBase();
const API_V1 = `${API_BASE}/api/v1`;
const TOKEN_KEY = "studyloop.token";

/** A failed request, carrying the backend's own `detail` message.
 *
 * FastAPI puts a human-readable reason in `detail` for every HTTPException
 * the app raises — "This timer has not finished", "Session must be in
 * recall phase" — and the study loop leans on those heavily, since a lot
 * of them are legitimate states the UI has to explain rather than bugs. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Token storage
// ---------------------------------------------------------------------------
// localStorage rather than a cookie: the API is a different origin and
// authenticates with a bearer header, so there is no cookie for the browser
// to attach anyway. Guarded because this module is imported by components
// that Next renders on the server first, where localStorage doesn't exist.

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Private-mode / blocked storage: the session still works for as long
    // as the tab lives, it just won't survive a reload.
  }
  notify();
}

// --- token as an external store ------------------------------------------
// Components read the token with useToken() rather than copying it into
// state inside an effect. Besides being the pattern React actually wants
// for "state that lives outside React", it makes a logout in one window
// take effect in the others: the `storage` event fires cross-tab, and
// notify() covers same-tab writes, which `storage` deliberately skips.

const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** The stored token, or null. `null` during server rendering and the first
 * client render; `useHydrated()` tells those apart from a real logout. */
export function useToken(): string | null {
  return useSyncExternalStore(subscribe, getToken, () => null);
}

/** False on the server and during hydration, true afterwards.
 *
 * Lets a component wait for localStorage to be readable instead of
 * flashing the logged-out view at someone who is already signed in. */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, alwaysTrue, alwaysFalse);
}

const alwaysTrue = () => true;
const alwaysFalse = () => false;

// ---------------------------------------------------------------------------
// Request plumbing
// ---------------------------------------------------------------------------

async function failure(response: Response): Promise<ApiError> {
  let detail = `Request failed (${response.status})`;
  try {
    const body = await response.json();
    if (typeof body?.detail === "string") {
      detail = body.detail;
    } else if (Array.isArray(body?.detail)) {
      // Pydantic validation errors arrive as a list of {loc, msg, ...}.
      detail = body.detail.map((item: { msg?: string }) => item?.msg).filter(Boolean).join("; ") || detail;
    }
  } catch {
    // Non-JSON error body (a proxy error page, say) — keep the generic text.
  }
  return new ApiError(response.status, detail);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_V1}${path}`, { ...init, headers });
  } catch {
    // fetch() only rejects on a transport failure, and the overwhelmingly
    // likely cause here is the backend not running — worth saying so
    // instead of surfacing "Failed to fetch".
    throw new ApiError(0, `Cannot reach the backend at ${API_BASE}. Is it running?`);
  }
  if (!response.ok) throw await failure(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function postJson<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Types — mirror backend/schemas/study.py and the endpoint return shapes
// ---------------------------------------------------------------------------

export type Objective = {
  id: string;
  title: string;
  expected_points: string[];
  source_pages: number[];
  content?: string;
};

export type ObjectiveStatus = "correct" | "partial" | "incorrect" | "not_demonstrated";

export type ProgressEntry = {
  concept_id: string;
  status: ObjectiveStatus;
  evidence: string;
  missing_points: string[];
  misconceptions: string[];
  follow_up_question: string;
  assessed_at: number;
  attempt_count: number;
  last_demonstrated_status: ObjectiveStatus | null;
};

export type DocumentSummary = { id: number; title: string; status: string };

export type DocumentDetail = DocumentSummary & {
  objectives: Objective[];
  progress: Record<string, ProgressEntry>;
};

/** The session state machine, from `study_service.advance()`.
 *
 * study -> recall -> feedback -> break -> review -> recall -> ...
 * "review" is round 2+'s equivalent of "study"; both are timed reading
 * phases where the tutor chat is available. */
export type Phase = "study" | "review" | "recall" | "feedback" | "break" | "completed";

export type Lesson = {
  markdown: string;
  check_questions: string[];
  source_pages: number[];
};

export type StudySession = {
  id: number;
  document_id: number;
  objective_ids: string[];
  phase: Phase;
  paused: boolean;
  round_number: number;
  /** The round lengths this session was created with. */
  study_seconds: number;
  break_seconds: number;
  /** Server-clock epoch seconds, or null in an untimed phase. */
  deadline: number | null;
  /** The server's clock at the moment it built this response. Paired with
   * `receivedAt` to run the countdown without ever comparing the two
   * machines' absolute clocks. */
  server_time: number;
  remaining_seconds: number | null;
  lesson: Lesson | null;
  /** `Date.now()` on THIS machine when the response arrived. Stamped by
   * the client, not sent by the server. */
  receivedAt: number;
};

export type AssessmentItem = {
  concept_id: string;
  status: ObjectiveStatus;
  evidence: string;
  missing_points: string[];
  misconceptions: string[];
  follow_up_question: string;
};

export type Assessment = { items: AssessmentItem[]; summary: string };

export type RecallResult = { assessment: Assessment; lesson: Lesson };

export type RecallAttempt = {
  round_number: number;
  text: string;
  result: RecallResult;
  created_at: number;
};

export type ChatAnswer = { answer: string; source_pages: number[] };

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type WellbeingReading = {
  round_number: number;
  avg_stress: number | null;
  pct_high_stress: number | null;
  longest_high_stress_run_sec: number;
  blink_rate_per_min: number | null;
  drowsiness_alert_count: number;
  extend_break: boolean;
  extra_break_minutes: number;
  created_at: number;
};

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function signup(email: string, username: string, password: string) {
  return postJson<{ uid: number; email: string; username: string }>("/auth/signup", {
    email,
    username,
    password,
  });
}

export async function login(email: string, password: string): Promise<string> {
  // OAuth2PasswordRequestForm is form-encoded, not JSON, and carries the
  // email in its "username" field (see backend/api/v1/endpoints/auth.py).
  const form = new URLSearchParams({ username: email, password });
  const result = await request<{ access_token: string }>("/auth/login/access-token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  setToken(result.access_token);
  return result.access_token;
}

export function logout() {
  setToken(null);
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

/** Upload and analyze one document.
 *
 * Slow by nature — the request doesn't return until Gemini has extracted
 * the learning objectives — so callers should show progress rather than
 * assuming this is a quick round trip. */
export async function uploadDocument(file: File): Promise<DocumentDetail> {
  const body = new FormData();
  body.append("file", file);
  // Content-Type is deliberately unset: the browser has to add it itself
  // so it can include the multipart boundary.
  return request<DocumentDetail>("/documents", { method: "POST", body });
}

export function listDocuments() {
  return request<DocumentSummary[]>("/documents");
}

export function getDocument(documentId: number) {
  return request<DocumentDetail>(`/documents/${documentId}`);
}

export function getDocumentObjects(documentId: number) {
  return request<{ objects: Objective[] }>(`/documents/${documentId}/content`);
}

/** The original file as an object URL for the reader's <iframe>.
 *
 * Fetched rather than linked because /documents/{id}/file needs the bearer
 * token, and an <iframe src> can't carry one. Callers own the returned URL
 * and must URL.revokeObjectURL() it when the document changes or unmounts. */
export async function getDocumentFileUrl(documentId: number): Promise<string> {
  const token = getToken();
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_V1}/documents/${documentId}/file`, { headers });
  if (!response.ok) throw await failure(response);
  return URL.createObjectURL(await response.blob());
}

// ---------------------------------------------------------------------------
// Study sessions
// ---------------------------------------------------------------------------

/** Record when a session snapshot reached this machine.
 *
 * Everything about the countdown is derived from the gap between
 * `deadline` and `server_time` (both server-side) plus how long ago this
 * arrived (both client-side). Neither number is ever compared across
 * machines, so a browser clock that is minutes off changes nothing. */
function stamp(session: StudySession): StudySession {
  return { ...session, receivedAt: Date.now() };
}

export async function createSession(params: {
  document_id: number;
  objective_ids?: string[];
  study_seconds?: number;
  break_seconds?: number;
}) {
  return stamp(await postJson<StudySession>("/sessions", params));
}

export async function listSessions(documentId?: number) {
  const query = documentId === undefined ? "" : `?document_id=${documentId}`;
  return (await request<StudySession[]>(`/sessions${query}`)).map(stamp);
}

export async function getSession(sessionId: number) {
  return stamp(await request<StudySession>(`/sessions/${sessionId}`));
}

/** Move to the next phase. 409s if the current timer hasn't run out, or if
 * recall hasn't been submitted yet — both are normal, not bugs. */
export async function advanceSession(sessionId: number) {
  return stamp(await postJson<StudySession>(`/sessions/${sessionId}/advance`, {}));
}

export async function pauseSession(sessionId: number) {
  return stamp(await postJson<StudySession>(`/sessions/${sessionId}/pause`, {}));
}

export async function resumeSession(sessionId: number) {
  return stamp(await postJson<StudySession>(`/sessions/${sessionId}/resume`, {}));
}

export async function completeSession(sessionId: number) {
  return stamp(await postJson<StudySession>(`/sessions/${sessionId}/complete`, {}));
}

/** Submit the brain dump for this round.
 *
 * `submissionId` must be a stable UUID for one attempt: the backend keys
 * idempotency on it, so a retry after a timeout returns the original
 * assessment instead of burning a second Gemini call and a second attempt
 * against the round's uniqueness constraint. Generate it once when the
 * recall phase starts, not per click. */
export function submitRecall(sessionId: number, submissionId: string, text: string) {
  return postJson<RecallResult>(`/sessions/${sessionId}/recall`, {
    submission_id: submissionId,
    text,
  });
}

export function listAttempts(sessionId: number) {
  return request<RecallAttempt[]>(`/sessions/${sessionId}/attempts`);
}

/** Ask the side tutor a question.
 *
 * 409s outside an active study/review timer — the backend deliberately
 * refuses to tutor during recall so it can't leak the answers. */
export function sendChat(sessionId: number, message: string) {
  return postJson<ChatAnswer>(`/sessions/${sessionId}/chat`, { message });
}

export function getChatHistory(sessionId: number) {
  return request<ChatMessage[]>(`/sessions/${sessionId}/chat`);
}

export function getWellbeing(sessionId: number) {
  return request<WellbeingReading[]>(`/sessions/${sessionId}/wellbeing`);
}

// ---------------------------------------------------------------------------
// Timer helpers
// ---------------------------------------------------------------------------

/** Seconds left on the current phase's timer.
 *
 * Two independent measurements, never mixed:
 *   `deadline - server_time`   how long the server said was left, server clock
 *   `now - receivedAt`         how long ago we heard that, browser clock
 *
 * Subtracting the second from the first gives a countdown that is correct
 * even when the two machines' clocks disagree by minutes, because no
 * server timestamp is ever compared against a browser timestamp.
 *
 * The obvious-looking alternative — computing an offset as
 * `server_time - now` and applying it to `deadline` — is worse than it
 * looks: the two `now`s cancel and it collapses to the constant
 * `deadline - server_time`, i.e. a clock frozen at its starting value. */
export function remainingSeconds(session: StudySession): number | null {
  if (session.paused) return session.remaining_seconds;
  if (session.deadline === null) return null;
  const leftAtSnapshot = session.deadline - session.server_time;
  const sinceSnapshot = (Date.now() - session.receivedAt) / 1000;
  return Math.max(0, leftAtSnapshot - sinceSnapshot);
}

export function formatClock(seconds: number | null): string {
  if (seconds === null) return "--:--";
  const whole = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(whole / 60);
  return `${String(minutes).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}

export { API_BASE };
