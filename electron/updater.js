const { app } = require("electron");
const { autoUpdater } = require("electron-updater");

/**
 * Auto-update against the public GitHub Releases feed (configured in
 * electron-builder.yml under `publish`). The app checks on launch and every few
 * hours, downloads new versions in the background, and installs on quit — with a
 * "restart now" path when the user wants it sooner.
 *
 * Only works in a packaged build; `electron .` in dev is a no-op.
 */
const state = { status: "idle", version: null, progress: 0 };
let notify = () => {};

function set(status, version) {
  state.status = status;
  if (version) state.version = version;
  notify(state);
}

function initUpdater(onChange) {
  notify = typeof onChange === "function" ? onChange : notify;

  if (!app.isPackaged) {
    // Dev: report a stable idle state so the UI has something to read.
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => set("checking"));
  autoUpdater.on("update-available", (info) => set("downloading", info?.version));
  autoUpdater.on("update-not-available", () => set("idle"));
  autoUpdater.on("download-progress", (p) => {
    state.progress = Math.round(p?.percent ?? 0);
    notify(state);
  });
  autoUpdater.on("update-downloaded", (info) => set("ready", info?.version));
  autoUpdater.on("error", (err) => {
    console.error("auto-update error:", err?.message ?? err);
    set("idle");
  });

  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  check();
  setInterval(check, 6 * 60 * 60 * 1000);
}

/** Restart into the freshly downloaded version. No-op unless one is ready. */
function installUpdate() {
  if (state.status === "ready") autoUpdater.quitAndInstall();
}

module.exports = {
  initUpdater,
  installUpdate,
  getUpdateState: () => state,
};
