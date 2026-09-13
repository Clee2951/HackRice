# HackRice Kiosk (Electron)

An Electron shell around the `casino_theme/` Next.js UI, with:
- Kiosk/lockdown mode **on by default** (full-screen, taskbar hidden on
  Windows — see the limitation note below)
- A visible **EXIT** button in the UI (top-right) with an optional PIN,
  wired through `preload.js`'s `window.kioskAPI`
- A renderer-independent emergency exit shortcut (see below) — mandatory
  safety valve for anything that blocks window close
- Drag-and-drop / "Choose File" upload, proxied to your FastAPI backend
  (which forwards to Vultr Object Storage — the secret key never lives
  in this app)
- Windows taskbar auto-hide/restore that survives the native file dialog
  and every possible exit path (clean exit, crash, SIGINT/SIGTERM)

## ⚠️ Honest limitation: this is a deterrent, not a real lockdown

**There is no way for a normal Electron app to reliably block Cmd+Tab or
Mission Control on macOS** (or, generally, low-level OS shortcuts on any
platform) — that's intentional OS security design, not a bug here. Real
"LockDown Browser"-style products need special system-level
installers/entitlements to do that; a BrowserWindow API doesn't have
access to those mechanisms.

What this app actually does when in kiosk mode:
- Removes the macOS default app menu (and the Cmd+Q/Cmd+H/Cmd+M shortcuts
  bound to it)
- Blocks the window from closing except through the Exit button/PIN flow,
  **or** the emergency shortcut below

Treat all of that as "makes leaving mildly inconvenient," not "makes
leaving impossible." State this plainly in any demo/report — don't
oversell it.

### 🚨 Emergency exit: `Cmd/Ctrl+Alt+Shift+X`

**A real user got hard-locked out twice** by an earlier version of this
app that also stole focus back on every `blur` and stayed always-on-top —
it fought every legitimate way to regain control (Force Quit, Activity
Monitor, switching to a terminal), and there was no way out short of
powering the machine off. That behavior has been removed entirely.

This shortcut always works — independent of the renderer, the PIN, or
whether the web UI even loaded — and quits immediately, bypassing
`EXIT_PIN`. If you're ever stuck, use it before resorting to anything more
drastic. If it doesn't respond (another app may already hold that
combo — check the terminal log for a warning about this), the Exit
button/PIN flow is the fallback; only power off as an absolute last
resort.

## Setup

```bash
cd frontend
npm install
cp .env.example .env   # edit BACKEND_URL / EXIT_PIN / NEXT_APP_URL as needed
cd casino_theme && npm install   # the actual UI is a separate Next.js app
```

## Running

You need **both** running at once — the Electron shell only displays
whatever's at `NEXT_APP_URL` (default `http://localhost:3000`), it doesn't
serve the UI itself:

```bash
# terminal 1
cd frontend/casino_theme && npm run dev

# terminal 2
cd frontend && npm start
```

**Kiosk/lockdown mode is now the default** (`npm start`). For local
development — a normal resizable window, no focus-stealing, easy to
Cmd+Tab away from while iterating — use:
```bash
npm run dev
```

To get out of kiosk mode, click the **EXIT** button (top-right) in the UI
and confirm. If you set `EXIT_PIN` in `.env`, it'll ask for that PIN first.

## Building a standalone installer

```bash
npm run build
```

Produces a `.exe` (Windows/NSIS), `.dmg` (macOS), or `.AppImage` (Linux)
in the `dist/` folder, depending on the OS you build on.

## How the taskbar fix works

Windows automatically re-reveals the taskbar whenever a separate
top-level window (like the native "Open File" dialog) takes focus, even
if the Electron window underneath is still in kiosk/fullscreen mode.

`taskbar.ps1` uses `user32.dll` to hide/show the taskbar, Start button,
and any secondary (multi-monitor) taskbars. `main.js` calls it
**synchronously** (`execFileSync`, not `spawn`) so the app process
physically cannot exit before the "restore" call finishes -- this was
the fix for the taskbar getting stuck hidden after quitting.

It's triggered:
- On window ready (hide)
- On every `focus` event of the main window (re-hide, e.g. after the
  file dialog closes)
- Immediately after the file picker dialog resolves (extra safety net)
- On every exit path: Exit button, window close, `before-quit`,
  `will-quit`, uncaught exceptions, `SIGINT`, `SIGTERM`
- On every app startup (force-restore first, in case a previous run
  crashed and left it hidden)

**If your taskbar ever gets stuck hidden** (e.g. from an older version
of this app, or a hard crash): press `Ctrl+Shift+Esc` → File → Run new
task → type `explorer.exe` → Enter. This restarts Explorer instantly,
no reboot needed.

## How the guaranteed exit button works

There are actually **two** Exit buttons, both calling the same
`window.kioskAPI.getConfig()`/`requestExit()` bridge:

1. A React one in `casino_theme/app/components/blackjackTable.tsx` — part
   of the actual UI.
2. A second one **injected directly by `main.js`**, independent of that
   React app entirely.

The injected one is the important part, and exists because of a real
failure mode: the Electron window only shows whatever's at `NEXT_APP_URL`
(`mainWindow.loadURL(...)`) — if that Next.js dev server isn't running,
the window shows Chromium's bare connection-error page, which has nothing
clickable on it at all. Relying solely on the React button means a
downed dev server = no visible way out.

**How it's injected** (`injectExitOverlay()` in `main.js`):
- Runs on `webContents.on("dom-ready", ...)` — fires for *any* page this
  window loads, not just the intended one.
- `webContents.insertCSS(css)` adds the button/modal styling.
- `webContents.executeJavaScript(js)` builds the button + PIN modal as
  plain DOM nodes and appends them to `document.body`, then wires their
  click handlers to `window.kioskAPI` — the same `contextBridge`-exposed
  API the React button uses, so there's one IPC code path, not two.
- Guards against double-injection (`dom-ready` can fire more than once)
  by checking whether `#__kiosk_exit_btn` already exists before adding
  anything.
- Bails out early if `window.kioskAPI` isn't present (e.g. this script
  somehow ran outside the Electron preload context) rather than injecting
  a button that can't actually do anything.

**The fallback page** (`did-fail-load` handler): if the real app can't be
reached, `main.js` loads a minimal inline `data:text/html,...` page
instead of leaving Chromium's default error page up. That page also
triggers `dom-ready`, so the injected Exit button appears on it too —
meaning there's always a working way out, even when the intended UI
never loads at all.

## Connecting to your backend

The renderer talks to the backend directly, using the bearer token it got
at login. The main process does **not** upload anything itself: it has no
token, and adding an unauthenticated upload route so it could would be a
hole in the API. `kiosk:pickFile` therefore hands the renderer the file's
*bytes* along with its name, and the renderer POSTs them to
`/api/v1/documents` — the same endpoint the browser build uses — where
Gemini extracts the learning objectives.

(An earlier version posted to `POST {BACKEND_URL}/api/v1/upload/` from the
main process. That endpoint does not exist in `backend/` — it belonged to
`backend-GI/` — so that path never worked.)

Vultr access/secret keys live only in `backend/.env`, never in this
Electron app. See `docs/vultr-object-storage.md`.

## Presage camera capture

During each study/review round the main process spawns
`presage/session.mjs` as a child process, passing it the active
`STUDY_SESSION_ID` and the logged-in `AUTH_TOKEN`. That script owns the
camera and posts its own stress/drowsiness summary to
`POST /api/v1/sessions/{id}/wellbeing` when the round ends, which is what
lets a stressful round extend the *next* break.

- The API key comes from the **repo-root** `.env`
  (`SMARTSPECTRA_API_KEY`), the same file `presage/`'s own npm scripts
  read — not from `frontend/.env`.
- Run `npm install` inside `presage/` first, or the spawn fails on a
  missing `@smartspectra/node-sdk`.
- Capture runs under a real `node` binary, **not** Electron-as-node: the
  SDK ships a native addon built against system Node's ABI. Set
  `PRESAGE_NODE` if `node` isn't on the PATH of whatever launches the app.
- Stopping a round sends `SIGTERM`, which `session.mjs` traps so it can
  release the camera and post its summary. Killing it outright would
  throw away the measurement the round existed to take.
- With no key set, the UI's wellbeing panel says the camera is
  unavailable and everything else works normally.

## Files

| File | Purpose |
|---|---|
| `main.js` | Main process: window creation, injected exit-button overlay, emergency shortcut, taskbar control, IPC handlers, Presage capture lifecycle |
| `preload.js` | Secure bridge exposing `window.kioskAPI` to the renderer |
| `taskbar.ps1` | PowerShell helper to hide/show the Windows taskbar |
| `casino_theme/` | The actual UI — a separate Next.js app, loaded via `NEXT_APP_URL` |
| `.env.example` | Template for `BACKEND_URL` / `NEXT_APP_URL` / `EXIT_PIN` / `PRESAGE_NODE` |
