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

## Connecting to your backend

This app expects a FastAPI endpoint at:

```
POST {BACKEND_URL}/api/v1/upload/
```

accepting a `multipart/form-data` body with a `file` field, which your
backend then forwards to Vultr Object Storage (S3-compatible) using
`boto3`. Your Vultr access/secret keys should live only in
`backend/.env`, never in this Electron app.

## Files

| File | Purpose |
|---|---|
| `main.js` | Main process: window creation, kiosk hardening, taskbar control, IPC handlers, upload logic |
| `preload.js` | Secure bridge exposing `window.kioskAPI` to the renderer |
| `taskbar.ps1` | PowerShell helper to hide/show the Windows taskbar |
| `casino_theme/` | The actual UI — a separate Next.js app, loaded via `NEXT_APP_URL` |
| `.env.example` | Template for `BACKEND_URL` / `EXIT_PIN` / `NEXT_APP_URL` |
