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
const { openApp } = require("./executor");
// Otto-style: a slim bar floating top-center that expands downward when it
// has something to show. The renderer reports its height and we resize to fit.
const OVERLAY_WIDTH = 720;
const BAR_HEIGHT = 76;
const MAX_HEIGHT = 660;

let tray = null;
let quitting = false;
let cursorWindow = null;

// Shown while a window can't reach the hosted app, instead of Chromium's error
// page. Dark to match the overlay; it just tells the user we're retrying.
const RECONNECTING_HTML =
  "data:text/html," +
  encodeURIComponent(`<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{height:100%;margin:0;background:#0c0c0e;color:#8b8b91;
      font-family:system-ui,"Segoe UI",sans-serif;display:flex;align-items:center;
      justify-content:center}
    .box{text-align:center;padding:24px}
    .dot{width:8px;height:8px;border-radius:50%;background:#8b8b91;display:inline-block;
      animation:p 1.2s ease-in-out infinite}
    @keyframes p{0%,100%{opacity:1}50%{opacity:.25}}
    h1{font-size:15px;color:#f5f5f5;margin:12px 0 6px;font-weight:600}
    p{font-size:12px;margin:0}
  </style></head><body><div class="box"><span class="dot"></span>
    <h1>Reconnecting to Otto…</h1><p>Check your internet — this retries on its own.</p>
  </div></body></html>`);

/**
 * Load a window's URL and, if it fails (network not ready at boot, a transient
 * blip, a Vercel cold start), show a reconnecting page and keep retrying with
 * backoff until it succeeds — instead of getting stuck on "page couldn't load".
 */
function loadWithRetry(win, url) {
  let delay = 1500;
  let timer = null;

  const attempt = () => {
    if (!win || win.isDestroyed()) return;
    win.loadURL(url).catch(() => {}); // rejection is also surfaced via did-fail-load
  };

  win.webContents.on("did-fail-load", (_e, errorCode, _desc, _validatedURL, isMainFrame) => {
    // -3 is ERR_ABORTED (a superseded navigation) — not a real failure.
    if (!isMainFrame || errorCode === -3 || win.isDestroyed()) return;
    if (win.webContents.getURL() !== RECONNECTING_HTML) {
      win.loadURL(RECONNECTING_HTML).catch(() => {});
    }
    clearTimeout(timer);
    timer = setTimeout(attempt, delay);
    delay = Math.min(delay * 1.6, 15000); // back off, capped at 15s
  });

  win.webContents.on("did-finish-load", () => {
    if (win.isDestroyed()) return;
    if (win.webContents.getURL().startsWith(url.split("?")[0])) delay = 1500; // reset on success
  });

  attempt();
}

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
    width: OVERLAY_WIDTH,
    height: BAR_HEIGHT,
    x: workArea.x + Math.round((workArea.width - OVERLAY_WIDTH) / 2),
    y: workArea.y + 14,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: false,
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
  loadWithRetry(overlay, `${APP_URL}/overlay`);

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

/** Resize the bar to fit its content, keeping it pinned top-center. */
function resizeOverlay(contentHeight) {
  if (!overlay || overlay.isDestroyed()) return;
  const h = Math.max(BAR_HEIGHT, Math.min(Math.round(contentHeight), MAX_HEIGHT));
  const [x] = overlay.getPosition();
  const [, y] = overlay.getPosition();
  overlay.setBounds({ x, y, width: OVERLAY_WIDTH, height: h });
}

/**
 * A full-screen, click-through overlay that draws the guiding cursor. It floats
 * above everything and lets every click pass through to the real app beneath, so
 * the user can actually press the button it points at.
 */
function createCursorWindow() {
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.bounds;

  cursorWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    focusable: false,
    fullscreenable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  cursorWindow.setAlwaysOnTop(true, "screen-saver");
  cursorWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  cursorWindow.setIgnoreMouseEvents(true, { forward: true }); // clicks pass through
  loadWithRetry(cursorWindow, `${APP_URL}/guide-cursor`);

  cursorWindow.on("closed", () => {
    cursorWindow = null;
  });
}

/** Point the guiding cursor at a normalized (0-1) location on the primary screen. */
function pointCursor(target) {
  if (!cursorWindow) return;
  const { width, height } = screen.getPrimaryDisplay().bounds;
  cursorWindow.showInactive();
  cursorWindow.setAlwaysOnTop(true, "screen-saver");
  cursorWindow.webContents.send("cluely:point-to", {
    x: Math.round((target?.x ?? 0.5) * width),
    y: Math.round((target?.y ?? 0.5) * height),
    label: target?.label ?? "",
  });
}

function clearCursor() {
  cursorWindow?.webContents.send("cluely:point-to", null);
  cursorWindow?.hide();
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
  tray.setToolTip("Otto");
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
      label: "Quit Otto",
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
 * screen. Our own windows stay VISIBLE but are excluded from the capture via
 * content protection (WDA_EXCLUDEFROMCAPTURE) — so the panel doesn't flash off
 * the screen every time you ask. Long edge is capped to keep the payload small.
 */
async function captureScreen() {
  const primary = screen.getPrimaryDisplay();
  const { width, height } = primary.size;
  const scale = primary.scaleFactor || 1;
  const nativeW = Math.round(width * scale);
  const nativeH = Math.round(height * scale);
  const cap = 1568; // Claude downsamples beyond ~1568px on the long edge anyway
  const factor = Math.min(1, cap / Math.max(nativeW, nativeH));

  // Exclude our windows from the capture without hiding them. Remember the
  // overlay's real setting so we can restore whatever the user chose.
  const overlayLive = overlay && !overlay.isDestroyed();
  const cursorLive = cursorWindow && !cursorWindow.isDestroyed();
  if (overlayLive) overlay.setContentProtection(true);
  if (cursorLive) cursorWindow.setContentProtection(true);
  await new Promise((r) => setTimeout(r, 40)); // let the flag take effect

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
    if (overlayLive) overlay.setContentProtection(state.contentProtection);
    if (cursorLive) cursorWindow.setContentProtection(false);
  }
}

function resetPosition() {
  if (!overlay) return;
  const { workArea } = screen.getPrimaryDisplay();
  overlay.setBounds({
    x: workArea.x + Math.round((workArea.width - OVERLAY_WIDTH) / 2),
    y: workArea.y + 14,
    width: OVERLAY_WIDTH,
    height: overlay.getBounds().height,
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

  // Ask by voice: start listening for a spoken question, then guide with the cursor.
  globalShortcut.register("CommandOrControl+Shift+G", () => {
    if (!overlay) return;
    if (!overlay.isVisible()) toggleVisible();
    overlay.webContents.send("cluely:voice-guide");
  });

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
  createCursorWindow();
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
ipcMain.handle("cluely:resize", (_event, height) => resizeOverlay(height));
ipcMain.handle("cluely:open", async (_event, target) => {
  try {
    return { ok: true, message: await openApp(target) };
  } catch (err) {
    return { ok: false, message: err?.message ?? "Could not open that." };
  }
});
ipcMain.handle("cluely:capture-screen", () => captureScreen());
ipcMain.handle("cluely:point", (_event, target) => pointCursor(target));
ipcMain.handle("cluely:clear-point", () => clearCursor());
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
