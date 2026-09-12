// Posts a finished section's wellbeing summary to the FastAPI backend's
// POST /sessions/{id}/wellbeing endpoint (see
// backend/api/v1/endpoints/sessions.py), so a sustained-stress/drowsiness
// section can actually extend the following break — not just print a
// recommendation to the console.
//
// Configured via env vars rather than hardcoded, since this script doesn't
// own session creation or auth — those come from whatever manages the real
// study session (a human via Swagger UI today; the Electron app eventually).
// If STUDY_SESSION_ID or AUTH_TOKEN aren't set, posting is skipped and the
// summary just stays local, exactly as it did before this integration.

/**
 * Creates a real backend study session (POST /sessions) so one command can
 * start both the session and the camera together, instead of requiring a
 * session to already exist (e.g. hand-created via Swagger UI) before
 * running this script. Requires AUTH_TOKEN and DOCUMENT_ID env vars.
 *
 * @param {object} options
 * @param {number} options.studySeconds - kept in sync with the capture's own SECTION_MINUTES, so the backend's study timer and this script's capture duration actually match.
 * @param {number} [options.breakSeconds=300]
 * @returns {Promise<number>} the created session's id.
 */
export async function createStudySession({ studySeconds, breakSeconds = 300 }) {
  const token = process.env.AUTH_TOKEN;
  const documentId = process.env.DOCUMENT_ID;
  if (!token) throw new Error("AUTH_TOKEN is required to create a study session.");
  if (!documentId) throw new Error("DOCUMENT_ID is required to create a study session.");

  const backendUrl = process.env.BACKEND_URL || "http://127.0.0.1:8000";
  const objectiveIds = process.env.OBJECTIVE_IDS?.split(",").map((s) => s.trim()).filter(Boolean);

  const res = await fetch(`${backendUrl}/api/v1/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      document_id: Number(documentId),
      ...(objectiveIds?.length ? { objective_ids: objectiveIds } : {}),
      study_seconds: Math.max(5, Math.round(studySeconds)),
      break_seconds: Math.max(5, Math.round(breakSeconds)),
    }),
  });
  if (!res.ok) {
    throw new Error(`Failed to create study session: ${res.status} ${await res.text()}`);
  }
  const session = await res.json();
  return session.id;
}

/** Maps stress.mjs's summarizeSection() shape to the backend's WellbeingReport schema. */
export function wellbeingReportFromSummary(summary) {
  return {
    avg_stress: summary.avgStress,
    pct_high_stress: summary.pctHighStress,
    longest_high_stress_run_sec: summary.longestHighStressRunSec,
    blink_rate_per_min: summary.blinkRatePerMin,
    drowsiness_alert_count: summary.drowsinessAlertCount,
    extend_break: summary.recommendation.extendBreak,
    extra_break_minutes: summary.recommendation.extraBreakMinutes,
  };
}

/**
 * @param {object} summary - the object returned by summarizeSection(), plus drowsinessAlertCount.
 * @returns {Promise<{posted: boolean, status?: number, response?: object, error?: string}>}
 */
export async function postWellbeing(summary) {
  const sessionId = process.env.STUDY_SESSION_ID;
  const token = process.env.AUTH_TOKEN;
  if (!sessionId || !token) {
    console.log(
      "[wellbeing] STUDY_SESSION_ID/AUTH_TOKEN not set — skipping backend post, summary stays local only.",
    );
    return { posted: false };
  }

  const backendUrl = process.env.BACKEND_URL || "http://127.0.0.1:8000";
  const url = `${backendUrl}/api/v1/sessions/${sessionId}/wellbeing`;
  const body = wellbeingReportFromSummary(summary);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error(`[wellbeing] backend rejected the report: ${res.status} ${await res.text()}`);
      return { posted: false, status: res.status };
    }
    const response = await res.json();
    console.log("[wellbeing] report posted to backend successfully.");
    return { posted: true, response };
  } catch (err) {
    // A network failure here shouldn't crash the capture session — the
    // summary already printed to the console as a fallback.
    console.error(`[wellbeing] failed to reach backend at ${url}: ${err.message}`);
    return { posted: false, error: err.message };
  }
}
