const { contextBridge, ipcRenderer } = require("electron");

/**
 * The bridge the overlay renderer talks to. Everything the desktop shell can do
 * is listed here — the renderer has no direct Node or Electron access.
 */
contextBridge.exposeInMainWorld("cluely", {
  isDesktop: true,

  getState: () => ipcRenderer.invoke("cluely:get-state"),

  /** Ask the bar window to resize to fit content of the given pixel height. */
  resize: (height) => ipcRenderer.invoke("cluely:resize", height),

  /** Screenshot of the primary display as a PNG data URL, or null. */
  captureScreen: () => ipcRenderer.invoke("cluely:capture-screen"),

  // Guiding cursor
  point: (target) => ipcRenderer.invoke("cluely:point", target),
  clearPoint: () => ipcRenderer.invoke("cluely:clear-point"),
  /** For the cursor window: receive where to point (or null to hide). */
  onPointTo: (callback) => {
    const handler = (_event, target) => callback(target);
    ipcRenderer.on("cluely:point-to", handler);
    return () => ipcRenderer.off("cluely:point-to", handler);
  },
  /** Fires when the voice-guide hotkey is pressed. */
  onVoiceGuide: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("cluely:voice-guide", handler);
    return () => ipcRenderer.off("cluely:voice-guide", handler);
  },

  setContentProtection: (enabled) => ipcRenderer.invoke("cluely:set-content-protection", enabled),
  setClickThrough: (enabled) => ipcRenderer.invoke("cluely:set-click-through", enabled),
  hide: () => ipcRenderer.invoke("cluely:hide"),
  quit: () => ipcRenderer.invoke("cluely:quit"),

  // Auto-update
  getUpdateState: () => ipcRenderer.invoke("cluely:get-update-state"),
  installUpdate: () => ipcRenderer.invoke("cluely:install-update"),
  onUpdate: (callback) => {
    const handler = (_event, next) => callback(next);
    ipcRenderer.on("cluely:update", handler);
    return () => ipcRenderer.off("cluely:update", handler);
  },

  /** Fires when the global Ctrl/Cmd+Enter hotkey is pressed, app focused or not. */
  onAssist: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("cluely:assist", handler);
    return () => ipcRenderer.off("cluely:assist", handler);
  },

  /** Fires when the main process changes state behind the renderer's back. */
  onState: (callback) => {
    const handler = (_event, next) => callback(next);
    ipcRenderer.on("cluely:state", handler);
    return () => ipcRenderer.off("cluely:state", handler);
  },
});
