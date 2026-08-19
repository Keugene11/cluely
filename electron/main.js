const {
  app,
  BrowserWindow,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  session,
  shell,
  Tray,
} = require("electron");
const path = require("node:path");
const { APP_URL } = require("./config");
const { initUpdater, installUpdate, getUpdateState } = require("./updater");
const OVERLAY_SIZE = { width: 440, height: 620 };

let tray = null;
let quitting = false;

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
    // Keep a taskbar entry so there is always an obvious way to close the window.
    skipTaskbar: false,
    closable: true,
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

  // Closing the window quits the whole app — no lingering hidden process.
  overlay.on("close", () => {
    quitting = true;
  });
  overlay.on("closed", () => {
    overlay = null;
    if (process.platform !== "darwin") app.quit();
  });
}

/**
 * A tray icon is the always-available escape hatch: right-click → Quit works no
 * matter what the panel is showing (even the signed-out state).
 */
function createTray() {
  const icon = nativeImage
    .createFromPath(path.join(__dirname, "tray-icon.png"))
    .resize({ width: 16, height: 16 });

  tray = new Tray(icon);
  tray.setToolTip("Cluely");
  refreshTrayMenu();

  // Left-click toggles the panel; on Windows a single click is most expected.
  tray.on("click", toggleVisible);
}

/** Rebuilt whenever update state changes so a ready update surfaces here too. */
function refreshTrayMenu() {
  if (!tray) return;
  const update = getUpdateState();

  const items = [
    { label: "Show / hide", click: toggleVisible },
    { label: "Reset position", click: resetPosition },
    { type: "separator" },
  ];

  if (update.status === "ready") {
    items.push({
      label: `Restart to update (${update.version})`,
      click: installUpdate,
    });
  } else if (update.status === "downloading") {
    items.push({ label: `Downloading update… ${update.progress}%`, enabled: false });
  } else {
    items.push({ label: "You're up to date", enabled: false });
  }

  items.push(
    { type: "separator" },
    {
      label: "Quit Cluely",
      accelerator: "CommandOrControl+Shift+Q",
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  );

  tray.setContextMenu(Menu.buildFromTemplate(items));
}

/**
 * Grab a screenshot of the primary display so the assistant can read what is on
 * screen. The overlay hides itself for the frame so it does not appear in its
 * own shot; long edge is capped so the payload to Claude stays reasonable.
 */
async function captureScreen() {
  const primary = screen.getPrimaryDisplay();
  const { width, height } = primary.size;
  const scale = primary.scaleFactor || 1;
  const nativeW = Math.round(width * scale);
  const nativeH = Math.round(height * scale);
  const cap = 1568; // Claude downsamples beyond ~1568px on the long edge anyway
  const factor = Math.min(1, cap / Math.max(nativeW, nativeH));

  const wasVisible = overlay && overlay.isVisible();
  if (wasVisible) overlay.hide();
  await new Promise((r) => setTimeout(r, 90)); // let the compositor drop it

  try {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: {
        width: Math.round(nativeW * factor),
        height: Math.round(nativeH * factor),
      },
    });
    const source =
      sources.find((s) => s.display_id === String(primary.id)) || sources[0];
    if (!source || source.thumbnail.isEmpty()) return null;
    return source.thumbnail.toDataURL(); // data:image/png;base64,...
  } catch {
    return null;
  } finally {
    if (wasVisible) {
      overlay.show();
      overlay.setAlwaysOnTop(true, "screen-saver");
    }
  }
}

function resetPosition() {
  if (!overlay) return;
  const { workArea } = screen.getPrimaryDisplay();
  overlay.setBounds({
    x: workArea.x + workArea.width - OVERLAY_SIZE.width - 24,
    y: workArea.y + 24,
    width: OVERLAY_SIZE.width,
    height: OVERLAY_SIZE.height,
  });
  if (!overlay.isVisible()) toggleVisible();
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
    overlay.show();
    overlay.setAlwaysOnTop(true, "screen-saver");
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

  // Always-available quit, whatever the panel is showing.
  globalShortcut.register("CommandOrControl+Shift+Q", () => {
    quitting = true;
    app.quit();
  });

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
  createTray();
  registerShortcuts();

  // Auto-update: push each state change to the tray menu and the overlay UI.
  initUpdater((updateState) => {
    refreshTrayMenu();
    overlay?.webContents.send("cluely:update", updateState);
  });

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
ipcMain.handle("cluely:capture-screen", () => captureScreen());
ipcMain.handle("cluely:get-update-state", () => getUpdateState());
ipcMain.handle("cluely:install-update", () => installUpdate());
ipcMain.handle("cluely:quit", () => {
  quitting = true;
  app.quit();
});

app.on("before-quit", () => {
  quitting = true;
});
app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
