// renderer.js
// Runs in the sandboxed renderer process. Has no direct Node/filesystem
// access -- everything goes through window.kioskAPI, defined in preload.js.

const exitBtn = document.getElementById("exit-btn");
const exitModal = document.getElementById("exit-modal");
const cancelExitBtn = document.getElementById("cancel-exit-btn");
const confirmExitBtn = document.getElementById("confirm-exit-btn");
const pinPromptText = document.getElementById("pin-prompt-text");
const pinInput = document.getElementById("pin-input");
const exitError = document.getElementById("exit-error");

const dropZone = document.getElementById("drop-zone");
const chooseFileBtn = document.getElementById("choose-file-btn");
const statusList = document.getElementById("status-list");

let requiresPin = false;

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
(async function init() {
  const config = await window.kioskAPI.getConfig();
  requiresPin = config.requiresPin;
})();

// ---------------------------------------------------------------------------
// Exit modal
// ---------------------------------------------------------------------------
exitBtn.addEventListener("click", () => {
  exitError.classList.add("hidden");
  pinInput.value = "";
  if (requiresPin) {
    pinPromptText.classList.remove("hidden");
    pinInput.classList.remove("hidden");
  } else {
    pinPromptText.classList.add("hidden");
    pinInput.classList.add("hidden");
  }
  exitModal.classList.remove("hidden");
});

cancelExitBtn.addEventListener("click", () => {
  exitModal.classList.add("hidden");
});

confirmExitBtn.addEventListener("click", async () => {
  const result = await window.kioskAPI.requestExit(pinInput.value);
  if (!result.success) {
    exitError.textContent = result.message || "Unable to exit.";
    exitError.classList.remove("hidden");
  }
  // On success, main.js calls app.quit() -- this window will close itself.
});

// ---------------------------------------------------------------------------
// Upload status helper
// ---------------------------------------------------------------------------
function addStatusLine(fileName) {
  const li = document.createElement("li");
  li.innerHTML = `<span>${fileName}</span><span class="status-pending">Uploading…</span>`;
  statusList.prepend(li);
  return li;
}

function updateStatusLine(li, success, message) {
  const statusSpan = li.querySelector("span:last-child");
  if (success) {
    statusSpan.textContent = "✓ Uploaded";
    statusSpan.className = "status-ok";
  } else {
    statusSpan.textContent = `✕ Failed${message ? `: ${message}` : ""}`;
    statusSpan.className = "status-fail";
  }
}

async function uploadPickedFile(filePath, fileName) {
  const li = addStatusLine(fileName);
  const result = await window.kioskAPI.uploadFile(filePath);
  updateStatusLine(li, result.success, result.message);
}

// ---------------------------------------------------------------------------
// Choose File button -> native dialog (main process)
// ---------------------------------------------------------------------------
chooseFileBtn.addEventListener("click", async () => {
  const picked = await window.kioskAPI.pickFile();
  if (picked.canceled) return;
  await uploadPickedFile(picked.filePath, picked.fileName);
});

// ---------------------------------------------------------------------------
// Drag and drop support
// ---------------------------------------------------------------------------
["dragenter", "dragover"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    dropZone.classList.add("drag-over");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    dropZone.classList.remove("drag-over");
  });
});

dropZone.addEventListener("drop", async (e) => {
  const files = e.dataTransfer.files;
  if (!files || files.length === 0) return;

  for (const file of files) {
    // Electron exposes a real filesystem path on dropped File objects.
    const filePath = file.path;
    await uploadPickedFile(filePath, file.name);
  }
});
