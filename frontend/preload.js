// preload.js
// Secure bridge between the sandboxed renderer (the casino_theme Next.js
// app) and the main process. No direct Node/filesystem/network access is
// exposed to the renderer -- only these specific, narrow functions.
//
// Typed on the renderer side in casino_theme/lib/kiosk.ts; keep the two in
// step. Every function here is optional at runtime from the renderer's
// point of view, because the same UI also runs in a plain browser during
// development, where `window.kioskAPI` simply isn't there.

const { contextBridge, ipcRenderer } = require("electron");

// The backend URL, passed in via webPreferences.additionalArguments so it
// is available synchronously -- before any page script runs. lib/api.ts
// reads it at module load to build its base URL, so an async IPC round
// trip would race the first request. This is what lets one installer be
// pointed at a different deployment without rebuilding the UI bundle.
const backendArg = process.argv.find((arg) => arg.startsWith("--study-loop-backend="));
contextBridge.exposeInMainWorld(
  "studyLoopBackendUrl",
  backendArg ? backendArg.slice("--study-loop-backend=".length) : undefined,
);

contextBridge.exposeInMainWorld("kioskAPI", {
  getConfig: () => ipcRenderer.invoke("kiosk:getConfig"),
  requestExit: (pin) => ipcRenderer.invoke("kiosk:requestExit", pin),
  // Returns the file's bytes along with its name: the renderer uploads
  // through the ordinary authenticated API call, since the bearer token
  // lives there and not in the main process.
  pickFile: () => ipcRenderer.invoke("kiosk:pickFile"),

  // --- Presage / SmartSpectra camera capture ---
  // Capture runs as a child process of the main process (see main.js), not
  // in the page: the SmartSpectra SDK is a Node module with a native
  // addon, which a renderer can't load.
  startPresage: (options) => ipcRenderer.invoke("presage:start", options),
  stopPresage: () => ipcRenderer.invoke("presage:stop"),

  /** Subscribe to capture events. Returns an unsubscribe function.
   *
   * The listener is wrapped so the renderer only ever sees the payload --
   * handing it Electron's IpcRendererEvent would leak `sender`, and with
   * it a way to send arbitrary IPC from page context. */
  onPresageEvent: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on("presage:event", listener);
    return () => ipcRenderer.removeListener("presage:event", listener);
  },
});
