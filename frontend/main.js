// main.js
// Electron main process: creates the kiosk window, manages Windows taskbar
// hide/restore (synchronously, so it can't be skipped on exit), and proxies
// file uploads to the FastAPI backend (which forwards them to Vultr).

const { app, BrowserWindow, ipcMain, dialog, Menu, globalShortcut } = require("electron");
const path = require("path");
const fs = require("fs");
const { execFileSync, spawn } = require("child_process");
require("dotenv").config({ path: path.join(__dirname, ".env") });
// The SmartSpectra key lives in the REPO ROOT .env, not frontend/.env --
// presage/package.json already reads it from there (`node --env-file=../.env`),
// and duplicating a key into a second file is how the two copies drift.
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";
const NEXT_APP_URL = process.env.NEXT_APP_URL || "http://localhost:3000";
const EXIT_PIN = process.env.EXIT_PIN || "";
const PRESAGE_DIR = path.join(__dirname, "..", "presage");
const PRESAGE_SCRIPT = path.join(PRESAGE_DIR, "session.mjs");
// Which node runs the capture script. Deliberately a real node binary
// rather than Electron-as-node (ELECTRON_RUN_AS_NODE): the SmartSpectra
// SDK ships a native addon built against system Node's ABI, and loading it
// under Electron's V8 is a version-mismatch crash waiting to happen.
// Override if node isn't on PATH under whatever launched the app.
const PRESAGE_NODE = process.env.PRESAGE_NODE || "node";
// Kiosk/lockdown is the DEFAULT now, not opt-in -- this app's whole purpose
// is lockdown, so plain `npm start` should actually attempt it. Pass
// --no-kiosk for local development (resizable window, no focus-stealing,
// easy to Cmd+Tab away from while iterating).
const IS_KIOSK = !process.argv.includes("--no-kiosk");
const TASKBAR_SCRIPT = path.join(__dirname, "taskbar.ps1");

// IMPORTANT, honest limitation: none of the hardening below achieves a true
// LockDown-Browser-style block. On macOS in particular, Cmd+Tab and Mission
// Control are OS-reserved shortcuts that Apple deliberately prevents
// ordinary (non-entitled) apps from intercepting -- that's intentional OS
// security design, not a bug here. Real lockdown-browser products need
// special system-level installers/entitlements to do this. What follows is
// deliberately modest: removing the few shortcuts/menu items Electron
// itself adds (Cmd+Q/H/M) and blocking the window from closing except
// through the Exit button/PIN flow. Treat this as a deterrent, not a
// guarantee -- document that clearly wherever this app's capabilities are
// described (README, demo narrative), same honesty standard as the
// stress-detection heuristics in presage/.
//
// SAFETY-CRITICAL, learned the hard way: an earlier version of this file
// also stole focus back on every 'blur' event and set always-on-top at the
// highest level. That combination forced a real user into TWO hard reboots
// -- it actively fought every legitimate way to regain control of their own
// machine (Force Quit, Activity Monitor, switching to a terminal to kill
// the process), and if the Exit button's IPC call ever glitched for any
// reason, there was no way out at all short of powering off. Removed
// entirely. Never build a "lockdown" feature that can out-fight a user's
// own OS-level escape routes -- a renderer-independent safety valve
// (EMERGENCY_EXIT_SHORTCUT below) is mandatory, not optional, for anything
// that blocks window close.
const EMERGENCY_EXIT_SHORTCUT = "CommandOrControl+Alt+Shift+X";
// Deliberately bypasses EXIT_PIN. This is the last-resort escape hatch --
// it must always work, independent of the renderer/React UI, the PIN, or
// anything else that could be broken/misconfigured. Registered at the
// Electron main-process level (globalShortcut), so it works even if the
// whole web UI fails to load or has a JS error.

let mainWindow;
let taskbarCurrentlyHidden = false;
// Only the exit-button/PIN flow (kiosk:requestExit) is allowed to actually
// close the window while in kiosk mode -- see the 'close' handler below.
let allowClose = false;

// ---------------------------------------------------------------------------
// Taskbar control (Windows only). Runs SYNCHRONOUSLY on purpose: if this were
// async (spawn), the app process could fully quit before the "show" call
// finished, leaving the taskbar stuck hidden. execFileSync blocks until
// PowerShell is completely done.
// ---------------------------------------------------------------------------
function setTaskbar(action) {
  if (process.platform !== "win32") return;
  if (!fs.existsSync(TASKBAR_SCRIPT)) return;

  try {
    execFileSync(
      "powershell.exe",
      ["-ExecutionPolicy", "Bypass", "-File", TASKBAR_SCRIPT, action],
      { windowsHide: true, timeout: 5000 }
    );
    taskbarCurrentlyHidden = action === "hide";
  } catch (err) {
    console.error(`Failed to ${action} taskbar:`, err.message);
  }
}

function restoreTaskbarIfNeeded() {
  if (process.platform !== "win32") return;
  // Always attempt a restore on exit/startup safety net, regardless of
  // our in-memory flag, in case a previous crashed run left it hidden.
  setTaskbar("show");
}

// ---------------------------------------------------------------------------
// Window creation
// ---------------------------------------------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    fullscreen: IS_KIOSK,
    kiosk: IS_KIOSK,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(NEXT_APP_URL);

  if (IS_KIOSK) {
    // Hide as soon as the window is ready.
    mainWindow.once("ready-to-show", () => setTaskbar("hide"));

    // Re-hide every time this window regains focus -- this is the fix for
    // the taskbar reappearing after the native "Open File" dialog closes.
    mainWindow.on("focus", () => setTaskbar("hide"));

    // Block the window from closing except through the exit-button/PIN
    // flow -- otherwise Cmd+W/Alt+F4 or a stray close request would bypass
    // it entirely.
    mainWindow.on("close", (event) => {
      if (!allowClose) event.preventDefault();
    });

    // Guaranteed exit button: injected by the main process into whatever
    // page ends up loaded, so it exists even if the Next.js app fails to
    // load (e.g. its dev server isn't running -- see the did-fail-load
    // handler below) or has a bug of its own. Same "don't depend on the
    // renderer working correctly" philosophy as the emergency shortcut.
    mainWindow.webContents.on("dom-ready", () => injectExitOverlay(mainWindow.webContents));

    // If the Next.js app can't be reached at all, don't leave the user on
    // Chromium's bare error page with nothing clickable -- show a minimal
    // local fallback (dom-ready still fires for this, so the exit overlay
    // above still gets injected onto it too).
    mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
      if (errorCode === -3) return; // ERR_ABORTED -- usually just a superseded navigation, not a real failure
      mainWindow.loadURL(
        "data:text/html," +
          encodeURIComponent(`<!doctype html><html><body style="background:#111;color:#fff;
            font-family:sans-serif;display:flex;align-items:center;justify-content:center;
            height:100vh;margin:0;text-align:center;">
            <div><h2>Could not load the app</h2>
            <p>${errorDescription} (code ${errorCode})</p>
            <p>Tried: ${validatedURL}</p>
            <p>Make sure the Next.js dev server (casino_theme/) is running.</p></div>
            </body></html>`),
      );
    });
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ---------------------------------------------------------------------------
// Guaranteed exit button overlay -- injected into the page itself (not part
// of the casino_theme React app) so it's present regardless of what that app
// is doing: still on the Landing splash, mid-navigation, showing an error,
// or just plain broken. Uses window.kioskAPI, the same bridge the React
// Exit button uses, so it goes through the identical getConfig/requestExit
// IPC flow -- no separate code path to keep in sync.
// ---------------------------------------------------------------------------
function injectExitOverlay(webContents) {
  const css = `
    #__kiosk_exit_btn { position: fixed; top: 12px; right: 12px; z-index: 2147483647;
      font: 14px system-ui, sans-serif; padding: 8px 16px; border-radius: 999px;
      border: 2px solid #fff; background: rgba(0,0,0,0.55); color: #fff; cursor: pointer; }
    #__kiosk_exit_modal { position: fixed; inset: 0; z-index: 2147483647; background: rgba(0,0,0,0.75);
      display: none; align-items: center; justify-content: center; font: 14px system-ui, sans-serif; }
    #__kiosk_exit_modal.open { display: flex; }
    #__kiosk_exit_modal .box { background: #161616; color: #fff; padding: 24px 28px; border-radius: 12px;
      text-align: center; min-width: 240px; }
    #__kiosk_exit_modal input { width: 100%; box-sizing: border-box; padding: 8px; margin: 12px 0;
      border-radius: 6px; border: none; text-align: center; }
    #__kiosk_exit_modal .err { color: #f88; min-height: 1.2em; font-size: 12px; }
    #__kiosk_exit_modal button { margin: 6px 4px 0; padding: 8px 18px; border-radius: 999px;
      border: 2px solid #fff; background: transparent; color: #fff; cursor: pointer; }
  `;
  const js = `
    (function () {
      if (document.getElementById("__kiosk_exit_btn")) return; // already injected on this page
      if (!window.kioskAPI) return; // not actually inside this Electron app

      var btn = document.createElement("button");
      btn.id = "__kiosk_exit_btn";
      btn.type = "button";
      btn.textContent = "EXIT";
      document.body.appendChild(btn);

      var modal = document.createElement("div");
      modal.id = "__kiosk_exit_modal";
      modal.innerHTML =
        '<div class="box">' +
          '<div style="margin-bottom:4px;">Exit kiosk mode?</div>' +
          '<input type="password" id="__kiosk_exit_pin" placeholder="PIN (if required)" />' +
          '<div class="err" id="__kiosk_exit_err"></div>' +
          '<button type="button" id="__kiosk_exit_cancel">Cancel</button>' +
          '<button type="button" id="__kiosk_exit_confirm">Exit</button>' +
        "</div>";
      document.body.appendChild(modal);

      var pinInput = modal.querySelector("#__kiosk_exit_pin");
      var errBox = modal.querySelector("#__kiosk_exit_err");

      btn.addEventListener("click", function () {
        window.kioskAPI.getConfig().then(function (config) {
          pinInput.style.display = config.requiresPin ? "block" : "none";
          pinInput.value = "";
          errBox.textContent = "";
          modal.classList.add("open");
          pinInput.focus();
        });
      });
      modal.querySelector("#__kiosk_exit_cancel").addEventListener("click", function () {
        modal.classList.remove("open");
      });
      function confirmExit() {
        window.kioskAPI.requestExit(pinInput.value).then(function (result) {
          if (!result.success) errBox.textContent = result.message || "Incorrect PIN.";
        });
      }
      modal.querySelector("#__kiosk_exit_confirm").addEventListener("click", confirmExit);
      pinInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") confirmExit();
      });
    })();
  `;
  webContents.insertCSS(css).catch(() => {});
  webContents.executeJavaScript(js).catch((err) => {
    console.error("Failed to inject exit overlay:", err.message);
  });
}

// ---------------------------------------------------------------------------
// Emergency exit -- see the SAFETY-CRITICAL note near EMERGENCY_EXIT_SHORTCUT
// above. Deliberately bypasses EXIT_PIN and doesn't depend on mainWindow or
// the renderer being in any particular (or even working) state.
// ---------------------------------------------------------------------------
function emergencyExit() {
  console.log("Emergency exit shortcut triggered.");
  allowClose = true;
  restoreTaskbarIfNeeded();
  app.quit();
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  // Startup safety net: if a previous run crashed and left the taskbar
  // hidden, force-restore it before we potentially hide it again.
  restoreTaskbarIfNeeded();

  // Electron adds a default macOS app menu (with Cmd+Q, Cmd+H, Cmd+M bound
  // to it) even with no menu bar visible -- removing it removes those
  // shortcuts too. Only the ones we can actually control; see the
  // limitation note at the top of this file for Cmd+Tab/Mission Control.
  if (IS_KIOSK) Menu.setApplicationMenu(null);

  if (IS_KIOSK) {
    const registered = globalShortcut.register(EMERGENCY_EXIT_SHORTCUT, emergencyExit);
    if (!registered) {
      // Don't fail startup over this, but it means the safety valve isn't
      // active (likely another app already holds this combo) -- surface it
      // loudly since it matters.
      console.error(
        `WARNING: could not register emergency exit shortcut (${EMERGENCY_EXIT_SHORTCUT}) -- ` +
          "it may be held by another application. The Exit button/PIN flow is the only way out.",
      );
    }
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  restoreTaskbarIfNeeded();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  restoreTaskbarIfNeeded();
});

app.on("will-quit", () => {
  restoreTaskbarIfNeeded();
  globalShortcut.unregisterAll();
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
  restoreTaskbarIfNeeded();
  app.exit(1);
});

process.on("SIGINT", () => {
  restoreTaskbarIfNeeded();
  process.exit(0);
});

process.on("SIGTERM", () => {
  restoreTaskbarIfNeeded();
  process.exit(0);
});

// ---------------------------------------------------------------------------
// IPC: exit request (with optional PIN check)
// ---------------------------------------------------------------------------
ipcMain.handle("kiosk:requestExit", async (_event, enteredPin) => {
  if (EXIT_PIN && enteredPin !== EXIT_PIN) {
    return { success: false, message: "Incorrect PIN." };
  }
  allowClose = true; // lets the 'close' handler's kiosk-mode block stand down for this quit
  restoreTaskbarIfNeeded();
  app.quit();
  return { success: true };
});

ipcMain.handle("kiosk:getConfig", async () => {
  return {
    requiresPin: Boolean(EXIT_PIN),
    backendUrl: BACKEND_URL,
    // Lets the wellbeing panel say "no key configured" instead of showing
    // a camera section that can never start.
    hasPresageKey: Boolean(process.env.SMARTSPECTRA_API_KEY),
  };
});

// ---------------------------------------------------------------------------
// IPC: file picker (native "Open File" dialog)
// ---------------------------------------------------------------------------
ipcMain.handle("kiosk:pickFile", async () => {
  if (!mainWindow) return { canceled: true };

  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Select a document to upload",
    properties: ["openFile"],
    filters: [
      { name: "Documents", extensions: ["pdf", "doc", "docx", "png", "jpg", "jpeg"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });

  // Safety net: re-hide the taskbar immediately after the dialog closes,
  // in addition to the "focus" event listener above.
  if (IS_KIOSK) setTaskbar("hide");

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  const filePath = result.filePaths[0];
  // Hand back the bytes, not just the path. The renderer uploads through
  // the ordinary authenticated POST /api/v1/documents -- it holds the
  // bearer token, the main process doesn't. Reading here keeps the
  // renderer free of filesystem access, so contextIsolation stays intact.
  try {
    const data = fs.readFileSync(filePath);
    return {
      canceled: false,
      filePath,
      fileName: path.basename(filePath),
      // Sliced to an exact ArrayBuffer: a Node Buffer is a view into a
      // shared pool, and structured-cloning it whole would ship
      // unrelated memory across the bridge.
      data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    };
  } catch (err) {
    return { canceled: true, error: `Could not read ${path.basename(filePath)}: ${err.message}` };
  }
});

// ---------------------------------------------------------------------------
// IPC: Presage / SmartSpectra camera capture
// ---------------------------------------------------------------------------
// Runs presage/session.mjs as a child process for the duration of one
// study/review round. That script owns the camera, the stress analysis
// (presage/stress.mjs) and the drowsiness detection (presage/drowsiness.mjs),
// and posts its own summary to POST /sessions/{id}/wellbeing when the
// section ends -- which is what lets a stressful round extend the next
// break. Nothing here re-implements any of that; this only starts it with
// the right session, relays a few lines back to the UI, and stops it.
//
// A previous version of the app had the renderer ask the MAIN process to
// upload files to /api/v1/upload/ -- an endpoint that does not exist in
// this backend (it was backend-GI's) and that the main process could not
// have authenticated against anyway, since the bearer token lives in the
// renderer. That handler is gone; uploads go through the renderer's own
// authenticated API client.

let presageProcess = null;

function sendPresageEvent(event) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("presage:event", event);
  }
}

/** Pull the few lines the UI cares about out of the capture script's stdout.
 *
 * Deliberately loose matching: session.mjs prints for a human, and a
 * missed line costs a status update, not a broken session. The numbers
 * that actually matter reach the backend directly from that script. */
function interpretPresageLine(line) {
  if (line.includes("WAKE UP")) {
    sendPresageEvent({ type: "drowsiness", message: line.replace(/^!+\s*/, "").replace(/\s*!+$/, "") });
    return;
  }
  if (line.startsWith("Section started")) {
    sendPresageEvent({ type: "status", status: "running", message: "Watching for stress and drowsiness." });
    return;
  }
  const extended = /Recommend \+(\d+) min break/.exec(line);
  if (extended) {
    sendPresageEvent({ type: "summary", extendBreak: true, extraBreakMinutes: Number(extended[1]) });
    return;
  }
  if (line.includes("No sustained high stress")) {
    sendPresageEvent({ type: "summary", extendBreak: false, extraBreakMinutes: 0 });
  }
}

function stopPresage() {
  if (!presageProcess) return;
  const child = presageProcess;
  presageProcess = null;
  // SIGTERM, not SIGKILL: session.mjs traps it, stops the camera cleanly
  // and POSTs the round's wellbeing summary on the way out. Killing it
  // outright would throw away the measurement the round was for.
  child.kill("SIGTERM");
  // Backstop in case it wedges -- a stuck camera process would hold the
  // device and block the next round from starting.
  setTimeout(() => {
    if (!child.killed) child.kill("SIGKILL");
  }, 5000);
}

ipcMain.handle("presage:start", async (_event, options = {}) => {
  const { sessionId, token, sectionMinutes, breakSeconds } = options;
  if (!process.env.SMARTSPECTRA_API_KEY) {
    sendPresageEvent({ type: "status", status: "error", message: "No SMARTSPECTRA_API_KEY set." });
    return { started: false, message: "No SMARTSPECTRA_API_KEY set in the repo-root .env." };
  }
  if (!fs.existsSync(PRESAGE_SCRIPT)) {
    sendPresageEvent({ type: "status", status: "error", message: "Capture script not found." });
    return { started: false, message: `Missing ${PRESAGE_SCRIPT}` };
  }
  if (presageProcess) stopPresage();

  sendPresageEvent({ type: "status", status: "starting" });
  const child = spawn(PRESAGE_NODE, [PRESAGE_SCRIPT], {
    cwd: PRESAGE_DIR,
    env: {
      ...process.env,
      // STUDY_SESSION_ID is always set here, so session.mjs attaches to
      // the session the UI already created rather than creating a second
      // one of its own.
      STUDY_SESSION_ID: String(sessionId),
      AUTH_TOKEN: token,
      BACKEND_URL,
      SECTION_MINUTES: String(sectionMinutes ?? 25),
      BREAK_SECONDS: String(breakSeconds ?? 300),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  presageProcess = child;

  let stdoutTail = "";
  child.stdout.on("data", (chunk) => {
    stdoutTail += chunk.toString();
    const lines = stdoutTail.split("\n");
    // Keep the last, possibly-incomplete line for the next chunk.
    stdoutTail = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) {
        console.log(`[presage] ${trimmed}`);
        interpretPresageLine(trimmed);
      }
    }
  });

  child.stderr.on("data", (chunk) => console.error(`[presage] ${chunk.toString().trim()}`));

  child.on("error", (err) => {
    presageProcess = null;
    const message =
      err.code === "ENOENT"
        ? `Could not run "${PRESAGE_NODE}". Install Node.js or set PRESAGE_NODE to its path.`
        : err.message;
    console.error(`[presage] ${message}`);
    sendPresageEvent({ type: "status", status: "error", message });
  });

  child.on("exit", (code, signal) => {
    if (presageProcess === child) presageProcess = null;
    // A SIGTERM exit is this app stopping the round on purpose, not a fault.
    if (signal === "SIGTERM" || code === 0) {
      sendPresageEvent({ type: "status", status: "stopped" });
    } else {
      sendPresageEvent({ type: "status", status: "error", message: `Capture exited (code ${code}).` });
    }
  });

  return { started: true };
});

ipcMain.handle("presage:stop", async () => {
  stopPresage();
  return { stopped: true };
});

// Never leave a camera process running after the window is gone.
app.on("before-quit", stopPresage);
app.on("window-all-closed", stopPresage);
