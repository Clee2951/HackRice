// main.js
// Electron main process: creates the kiosk window, manages Windows taskbar
// hide/restore (synchronously, so it can't be skipped on exit), and proxies
// file uploads to the FastAPI backend (which forwards them to Vultr).

const { app, BrowserWindow, ipcMain, dialog, Menu } = require("electron");
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
// special system-level installers/entitlements to do this. What follows are
// the practical mitigations actually available from a normal Electron app:
// stealing focus back immediately (blur handler), staying visually on top,
// and removing the few shortcuts/menu items Electron itself adds (Cmd+Q,
// Cmd+H, Cmd+M) that we CAN control. Treat this as a deterrent, not a
// guarantee -- document that clearly wherever this app's capabilities are
// described (README, demo narrative), same honesty standard as the
// stress-detection heuristics in presage/.

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

    // Best-effort deterrent, not a real block (see the limitation note at
    // the top of this file): steal focus back immediately if the user
    // manages to switch away, and keep the window above everything else at
    // the highest level Electron exposes.
    mainWindow.on("blur", () => {
      if (!mainWindow) return;
      mainWindow.show();
      mainWindow.focus();
    });
    mainWindow.setAlwaysOnTop(true, "screen-saver");

    // Block the window from closing except through the exit-button/PIN
    // flow -- otherwise Cmd+W/Alt+F4 or a stray close request would bypass
    // it entirely.
    mainWindow.on("close", (event) => {
      if (!allowClose) event.preventDefault();
    });
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
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
