// main.js
// Electron main process: creates the kiosk window, manages Windows taskbar
// hide/restore (synchronously, so it can't be skipped on exit), and proxies
// file uploads to the FastAPI backend (which forwards them to Vultr).

const { app, BrowserWindow, ipcMain, dialog, Menu, globalShortcut } = require("electron");
const path = require("path");
const fs = require("fs");
const { execFileSync } = require("child_process");
const https = require("https");
const http = require("http");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";
const NEXT_APP_URL = process.env.NEXT_APP_URL || "http://localhost:3000";
const EXIT_PIN = process.env.EXIT_PIN || "";
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
  return { requiresPin: Boolean(EXIT_PIN) };
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
  return { canceled: false, filePath, fileName: path.basename(filePath) };
});

// ---------------------------------------------------------------------------
// IPC: upload a file to the backend, which forwards it to Vultr Object
// Storage. Reading the file and making the HTTP request happens here in the
// main process, so the renderer never needs raw filesystem or network
// access (contextIsolation stays intact).
// ---------------------------------------------------------------------------
ipcMain.handle("kiosk:uploadFile", async (_event, filePath) => {
  return new Promise((resolve) => {
    try {
      const fileName = path.basename(filePath);
      const fileData = fs.readFileSync(filePath);
      const boundary = `----KioskBoundary${Date.now()}`;

      const payloadStart = Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
          `Content-Type: application/octet-stream\r\n\r\n`
      );
      const payloadEnd = Buffer.from(`\r\n--${boundary}--\r\n`);
      const body = Buffer.concat([payloadStart, fileData, payloadEnd]);

      const url = new URL(`${BACKEND_URL}/api/v1/upload/`);
      const client = url.protocol === "https:" ? https : http;

      const req = client.request(
        {
          hostname: url.hostname,
          port: url.port || (url.protocol === "https:" ? 443 : 80),
          path: url.pathname,
          method: "POST",
          headers: {
            "Content-Type": `multipart/form-data; boundary=${boundary}`,
            "Content-Length": body.length,
          },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ success: true, status: res.statusCode, body: data });
            } else {
              resolve({
                success: false,
                status: res.statusCode,
                message: `Server responded with ${res.statusCode}`,
                body: data,
              });
            }
          });
        }
      );

      req.on("error", (err) => {
        resolve({ success: false, message: err.message });
      });

      req.write(body);
      req.end();
    } catch (err) {
      resolve({ success: false, message: err.message });
    }
  });
});
