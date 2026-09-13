// main.js
// Electron main process: creates the kiosk window, manages Windows taskbar
// hide/restore (synchronously, so it can't be skipped on exit), and proxies
// file uploads to the FastAPI backend (which forwards them to Vultr).

const { app, BrowserWindow, ipcMain, dialog, Menu, globalShortcut, session } = require("electron");
const path = require("path");
const fs = require("fs");
const { execFileSync, spawn } = require("child_process");
require("dotenv").config({ path: path.join(__dirname, ".env") });
// The SmartSpectra key lives in the REPO ROOT .env, not frontend/.env --
// presage/package.json already reads it from there (`node --env-file=../.env`),
// and duplicating a key into a second file is how the two copies drift.
// Harmless no-op in a packaged app, where neither file exists.
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

// In a packaged app everything ships under resources/ as extraResources;
// in a source checkout it sits in the repo. One flag, used everywhere the
// two layouts differ.
const PACKAGED = app.isPackaged;
const RESOURCES = PACKAGED ? process.resourcesPath : path.join(__dirname, "..");

const EXIT_PIN = process.env.EXIT_PIN || "";

// The exported Next.js UI (casino_theme's `output: "export"` build). The
// packaged app serves these files itself -- there is no `next dev` on an
// end user's machine.
const UI_DIR = PACKAGED
  ? path.join(process.resourcesPath, "ui")
  : path.join(__dirname, "casino_theme", "out");

const PRESAGE_DIR = PACKAGED
  ? path.join(process.resourcesPath, "presage")
  : path.join(__dirname, "..", "presage");
const PRESAGE_SCRIPT = path.join(PRESAGE_DIR, "session.mjs");

// Which binary runs the capture script.
//
// Electron's own binary, in ELECTRON_RUN_AS_NODE mode -- NOT a system
// `node`. An earlier version of this file required system Node on the
// theory that the SmartSpectra SDK ships a node-gyp addon whose ABI
// wouldn't match Electron's. That was wrong, and the SDK's README says so
// outright: it is "pure-FFI ... no native addon, no binding.gyp, no
// electron-rebuild, no node-gyp". The C++ runtime is loaded at runtime
// through koffi, which is N-API and therefore ABI-stable across Node and
// Electron.
//
// This matters for the installer: requiring system Node would mean anyone
// who installs the .exe also has to install Node before the camera works.
// Set PRESAGE_NODE to override with a real node binary if ever needed.
const PRESAGE_NODE = process.env.PRESAGE_NODE || process.execPath;

/** Where the backend lives, in precedence order.
 *
 * A single installer has to be able to point at a different deployment
 * without being rebuilt, so this is resolved at runtime rather than baked
 * into the UI bundle:
 *
 *   1. BACKEND_URL in the environment (or frontend/.env in a checkout).
 *   2. backendUrl in <userData>/config.json -- the per-machine override,
 *      editable after install without touching Program Files.
 *   3. The default compiled in at build time.
 *
 * Anything unparseable is ignored rather than allowed to produce a window
 * that silently talks to nothing. */
function resolveBackendUrl() {
  const candidates = [process.env.BACKEND_URL, readUserConfig().backendUrl, DEFAULT_BACKEND_URL];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return new URL(candidate).origin;
    } catch {
      console.error(`Ignoring unparseable backend URL: ${candidate}`);
    }
  }
  return "http://127.0.0.1:8000";
}

// Overridden at build time by electron-builder (see the "extraMetadata"
// note in package.json) or simply edited before a build.
const DEFAULT_BACKEND_URL = process.env.DEFAULT_BACKEND_URL || "http://127.0.0.1:8000";

function userConfigPath() {
  return path.join(app.getPath("userData"), "config.json");
}

function readUserConfig() {
  try {
    return JSON.parse(fs.readFileSync(userConfigPath(), "utf8"));
  } catch {
    // Missing or malformed is the normal case on a fresh install.
    return {};
  }
}

const BACKEND_URL = resolveBackendUrl();
// Lockdown is ON by default, from the moment the window appears.
//
// This app's entire purpose is keeping you off everything else, so the
// default has to be locked -- an opt-in lockdown is a timer with extra
// steps. The renderer releases it for the phases where holding someone
// full-screen would be wrong (see casino_theme's studyRoom.tsx): breaks,
// a completed session, and while paused. Stepping away is the point of a
// break, so the app gets out of the way for it and locks again after.
//
//   --no-kiosk   never lock down (development)
//
// The escape hatches do not depend on any of this: the emergency shortcut
// and the injected exit button are registered at startup and stay live the
// whole time the app is running.
const LOCKDOWN_DISABLED = process.argv.includes("--no-kiosk");
let lockedDown = false;
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
// The UI server lives in its own module so its routing can be tested
// without launching Electron -- see uiServer.js.
const { startUiServer } = require("./uiServer");

let uiServer = null;

/** Engage or release lockdown at runtime.
 *
 * Driven by the study phase rather than by launch, so the window is
 * ordinary until there is actually something to focus on. Idempotent: the
 * renderer calls this on every phase change and most calls are no-ops.
 *
 * Honest about what it achieves -- see the limitation note at the top of
 * this file. Full-screen kiosk, hidden Windows taskbar, no app menu, and a
 * blocked window close. It makes leaving inconvenient, not impossible.
 */
function setLockdown(on) {
  if (LOCKDOWN_DISABLED) return { lockedDown: false, reason: "disabled by --no-kiosk" };
  if (!mainWindow || mainWindow.isDestroyed()) return { lockedDown };
  if (on === lockedDown) return { lockedDown };

  lockedDown = on;
  mainWindow.setKiosk(on);
  // setKiosk already implies full screen on macOS, and calling
  // setFullScreen unconditionally right after it can toggle the window
  // straight back out -- the two fight. Only correct it if kiosk didn't
  // land the window where we asked.
  if (mainWindow.isFullScreen() !== on) mainWindow.setFullScreen(on);
  // Close the ordinary ways out of the window. Deliberately NOT
  // setAlwaysOnTop or focus-stealing on blur: that combination is what
  // locked a teammate out of his own machine twice and cost two hard
  // reboots. These only grey out the window's own controls; they never
  // out-fight the OS.
  mainWindow.setMinimizable(!on);
  mainWindow.setClosable(!on);
  // The app menu is already removed at startup (see app.whenReady) and
  // stays removed -- rebuilding Electron's default template just to put
  // Cmd+Q back between rounds isn't worth the surface area.
  setTaskbar(on ? "hide" : "show");
  if (on) mainWindow.focus();
  console.log(`Lockdown ${on ? "engaged" : "released"}.`);
  return { lockedDown };
}

function createWindow(startUrl) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    // Starts as an ordinary window. setLockdown() takes it full-screen when
    // a study round begins.
    fullscreen: false,
    kiosk: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // Handed to the preload synchronously, so lib/api.ts can read the
      // backend URL before the first request rather than racing an async
      // IPC round trip.
      additionalArguments: [`--study-loop-backend=${BACKEND_URL}`],
    },
  });

  mainWindow.loadURL(startUrl);

  // Re-hide the taskbar whenever this window regains focus -- the fix for
  // it reappearing after the native "Open File" dialog closes. A no-op
  // unless lockdown is currently engaged.
  mainWindow.on("focus", () => {
    if (lockedDown) setTaskbar("hide");
  });

  // Block the window from closing during lockdown, except through the
  // exit-button/PIN flow -- otherwise Cmd+W/Alt+F4 or a stray close
  // request would bypass it entirely. Outside lockdown the window closes
  // like any other.
  mainWindow.on("close", (event) => {
    if (lockedDown && !allowClose) event.preventDefault();
  });

  // Guaranteed exit button: injected by the main process into whatever
  // page ends up loaded, so it exists even if the UI fails to load or has
  // a bug of its own. Always injected, not just in lockdown -- the whole
  // point is that it does not depend on the renderer working correctly,
  // and lockdown can now begin at any moment.
  mainWindow.webContents.on("dom-ready", () => injectExitOverlay(mainWindow.webContents));

  // Locked from the first paint. ready-to-show rather than immediately, so
  // the window is actually on screen when it goes full-screen.
  mainWindow.once("ready-to-show", () => setLockdown(true));

  {
    // If the UI can't be reached at all, don't leave the user on
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
            <p>The interface files could not be loaded. If you are running from
            source, build the UI first (<code>npm run build</code> in
            frontend/casino_theme) or start <code>next dev</code> and set
            NEXT_APP_URL.</p></div>
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
  // Undo setClosable(false) before quitting. app.quit() goes through the
  // window's close path, and a window left unclosable can refuse it --
  // which would defeat the one control that must never fail.
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setClosable(true);
    mainWindow.setMinimizable(true);
  }
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
  Menu.setApplicationMenu(null);

  {
    // Registered unconditionally. Lockdown can now engage at any moment, so
    // the escape hatch has to already exist when it does -- registering it
    // alongside lockdown would leave a window where there is no way out.
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

  // Camera access for Presage. The capture process opens the device
  // directly, but Electron still has to be willing to grant "media" or
  // Windows/macOS will refuse at the OS layer. Scoped to the app's own
  // loopback UI: a window that later loads remote content must not be able
  // to turn the camera on by asking.
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    const url = details?.requestingUrl || contents?.getURL() || "";
    callback(permission === "media" && url.startsWith("http://127.0.0.1:"));
  });

  // NEXT_APP_URL points the window at a running `next dev` instead of the
  // exported build -- the fast path while iterating on the UI. Unset (the
  // normal case, and always in a packaged app) it serves the export.
  const devUrl = process.env.NEXT_APP_URL;
  const ready = devUrl
    ? Promise.resolve(devUrl)
    : startUiServer(UI_DIR).then(({ url, server }) => {
        uiServer = server;
        return url;
      });

  ready
    .then((startUrl) => {
      console.log(`Loading UI from ${startUrl} (backend: ${BACKEND_URL})`);
      createWindow(startUrl);
      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow(startUrl);
      });
    })
    .catch((err) => {
      // Without a window there is nothing to show a message in, and the
      // emergency shortcut has nothing to close -- so say it plainly in a
      // dialog rather than exiting silently on a blank screen.
      console.error(err);
      dialog.showErrorBox("Facedown could not start", err.message);
      app.quit();
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
  allowClose = true; // lets the 'close' handler's lockdown block stand down for this quit
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setClosable(true);
  restoreTaskbarIfNeeded();
  app.quit();
  return { success: true };
});

ipcMain.handle("kiosk:setLockdown", async (_event, on) => setLockdown(Boolean(on)));

ipcMain.handle("kiosk:getConfig", async () => {
  return {
    requiresPin: Boolean(EXIT_PIN),
    lockdownAvailable: !LOCKDOWN_DISABLED,
    backendUrl: BACKEND_URL,
    // Lets the wellbeing panel say "no key configured" instead of showing
    // a camera section that can never start.
    hasPresageKey: Boolean(presageApiKey()),
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
  if (lockedDown) setTaskbar("hide");

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

/** The SmartSpectra key, from the environment or the per-machine config.
 *
 * A packaged app has no repo-root .env to read, and baking the key into
 * the installer would ship a shared secret to every person who installs
 * it -- the SDK's own docs warn against exactly that. So the supported
 * path for a distributed build is <userData>/config.json, which each
 * user fills in with their own key. */
function presageApiKey() {
  return process.env.SMARTSPECTRA_API_KEY || readUserConfig().smartspectraApiKey || "";
}

ipcMain.handle("presage:start", async (_event, options = {}) => {
  const { sessionId, token, sectionMinutes, breakSeconds } = options;
  const apiKey = presageApiKey();
  if (!apiKey) {
    sendPresageEvent({ type: "status", status: "error", message: "No SmartSpectra API key configured." });
    return {
      started: false,
      message: `No SmartSpectra API key. Set SMARTSPECTRA_API_KEY, or add {"smartspectraApiKey": "..."} to ${userConfigPath()}.`,
    };
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
      // Run Electron's bundled binary as plain Node. The SmartSpectra SDK
      // is pure FFI over koffi (N-API), so it loads under Electron's
      // runtime unchanged -- which is what keeps "install Node.js first"
      // off the list of things an end user has to do.
      ELECTRON_RUN_AS_NODE: "1",
      SMARTSPECTRA_API_KEY: apiKey,
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
        ? `Could not run the capture process at "${PRESAGE_NODE}".`
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
