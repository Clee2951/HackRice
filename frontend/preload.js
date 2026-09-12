// preload.js
// Secure bridge between the sandboxed renderer (index.html/renderer.js) and
// the main process. No direct Node/filesystem/network access is exposed to
// the renderer -- only these specific, narrow functions.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("kioskAPI", {
  getConfig: () => ipcRenderer.invoke("kiosk:getConfig"),
  requestExit: (pin) => ipcRenderer.invoke("kiosk:requestExit", pin),
  pickFile: () => ipcRenderer.invoke("kiosk:pickFile"),
  uploadFile: (filePath) => ipcRenderer.invoke("kiosk:uploadFile", filePath),
});
