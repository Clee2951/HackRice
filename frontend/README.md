# HackRice Kiosk (Electron)

A standalone kiosk app with:
- Full-screen kiosk mode with a visible **✕ Exit** button (optional PIN)
- Drag-and-drop / "Choose File" upload, proxied to your FastAPI backend
  (which forwards to Vultr Object Storage -- the secret key never lives
  in this app)
- Windows taskbar auto-hide/restore that survives the native file dialog
  and every possible exit path (clean exit, crash, SIGINT/SIGTERM)

## Setup

```bash
cd kiosk
npm install
cp .env.example .env   # edit BACKEND_URL / EXIT_PIN as needed
```

## Running

**Preview mode (normal window, safe to test in):**
```bash
npm start
```

**True kiosk mode (full-screen, taskbar hidden on Windows):**
```bash
npm start -- --kiosk
```

To get out of kiosk mode, click the **✕ Exit** button (top-right) and
confirm. If you set `EXIT_PIN` in `.env`, it'll ask for that PIN first.

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
| `main.js` | Main process: window creation, taskbar control, IPC handlers, upload logic |
| `preload.js` | Secure bridge exposing `window.kioskAPI` to the renderer |
| `taskbar.ps1` | PowerShell helper to hide/show the Windows taskbar |
| `renderer/index.html` | Kiosk UI markup |
| `renderer/style.css` | Kiosk UI styling |
| `renderer/renderer.js` | Kiosk UI behavior: exit modal, drag-and-drop, upload status |
| `.env.example` | Template for `BACKEND_URL` / `EXIT_PIN` |
