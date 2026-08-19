const { app, BrowserWindow, globalShortcut, ipcMain, screen, session, shell } = require("electron");
const path = require("node:path");

const APP_URL = process.env.CLUELY_URL || "http://localhost:3000";
const OVERLAY_SIZE = { width: 440, height: 620 };

/** Runtime state the renderer can read and toggle. */
const state = {
  contentProtection: false, // opt-in, see setContentProtection below
  clickThrough: false,
  visible: true,
};

let overlay = null;

function createOverlay() {
  const { workArea } = screen.getPrimaryDisplay();

  overlay = new BrowserWindow({
    width: OVERLAY_SIZE.width,
    height: OVERLAY_SIZE.height,
    x: workArea.x + workArea.width - OVERLAY_SIZE.width - 24,
    y: workArea.y + 24,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: true,
    minWidth: 340,
    minHeight: 260,
    skipTaskbar: true,
    fullscreenable: false,
    maximizable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Float above normal windows, including over full-screen apps.
  overlay.setAlwaysOnTop(true, "screen-saver");
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  overlay.once("ready-to-show", () => overlay.show());
  overlay.loadURL(`${APP_URL}/overlay`);

  // Keep navigation inside the app; send outside links to the real browser.
  overlay.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  overlay.on("closed", () => {
    overlay = null;
  });
}

/**
 * Ask the OS to leave this window out of screen captures.
 *
 * Windows: SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE), Windows 10 2004+.
 * macOS:   NSWindow.sharingType = .none — but apps capturing through
 *          ScreenCaptureKit (which current Zoom and Teams do) get the window
 *          anyway, so treat this as unreliable there.
 *
 * This is the same documented API password managers use to keep vaults out of
 * screen recordings. It is off until the user turns it on, and it is not a
 * security boundary: a phone pointed at the screen still sees everything.
 */
function setContentProtection(enabled) {
  state.contentProtection = Boolean(enabled);
  if (overlay) overlay.setContentProtection(state.contentProtection);
  return state.contentProtection;
}

/** Let clicks fall through to whatever is underneath the overlay. */
function setClickThrough(enabled) {
  state.clickThrough = Boolean(enabled);
  if (overlay) overlay.setIgnoreMouseEvents(state.clickThrough, { forward: true });
  return state.clickThrough;
}

function toggleVisible() {
  if (!overlay) return;
  state.visible = !overlay.isVisible();
  if (state.visible) {
    overlay.showInactive();
  } else {
    overlay.hide();
  }
}

function nudge(dx, dy) {
  if (!overlay) return;
  const [x, y] = overlay.getPosition();
  overlay.setPosition(x + dx, y + dy);
}

function registerShortcuts() {
  // The one the product is built around.
  globalShortcut.register("CommandOrControl+Return", () => {
    if (!overlay) return;
    if (!overlay.isVisible()) toggleVisible();
    overlay.webContents.send("cluely:assist");
  });

  globalShortcut.register("CommandOrControl+Shift+Space", toggleVisible);

  globalShortcut.register("CommandOrControl+Shift+H", () => {
    const next = setClickThrough(!state.clickThrough);
    overlay?.webContents.send("cluely:state", { ...state, clickThrough: next });
  });

  // Move the panel without reaching for the mouse.
  const step = 40;
  globalShortcut.register("CommandOrControl+Shift+Up", () => nudge(0, -step));
  globalShortcut.register("CommandOrControl+Shift+Down", () => nudge(0, step));
  globalShortcut.register("CommandOrControl+Shift+Left", () => nudge(-step, 0));
  globalShortcut.register("CommandOrControl+Shift+Right", () => nudge(step, 0));
}

/**
 * The overlay transcribes through the microphone, so it needs mic permission
 * granted up front — there is no Chrome permission bubble in a frameless window.
 */
function grantMediaPermissions() {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === "media" || permission === "audioCapture");
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return permission === "media" || permission === "audioCapture";
  });
}

app.whenReady().then(() => {
  grantMediaPermissions();
  createOverlay();
  registerShortcuts();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createOverlay();
  });
});

ipcMain.handle("cluely:get-state", () => ({
  ...state,
  platform: process.platform,
  systemAudio: process.platform === "win32",
}));

ipcMain.handle("cluely:set-content-protection", (_event, enabled) => setContentProtection(enabled));
ipcMain.handle("cluely:set-click-through", (_event, enabled) => setClickThrough(enabled));
ipcMain.handle("cluely:hide", () => {
  overlay?.hide();
  state.visible = false;
});
ipcMain.handle("cluely:quit", () => app.quit());

app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
