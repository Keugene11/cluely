// Windows computer control for Act mode. Uses PowerShell + Win32 P/Invoke so it
// needs no native modules. All actions run on the user's real desktop, so the
// agent loop that calls these is deliberately bounded and stoppable.
const { execFile } = require("node:child_process");
const { screen } = require("electron");

function runPowerShell(script) {
  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { windowsHide: true, timeout: 15000 },
      (err, stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message));
        else resolve(String(stdout).trim());
      },
    );
  });
}

/** Launch an app or open a URL/path. */
async function openApp(target) {
  const safe = String(target).replace(/'/g, "''");
  await runPowerShell(`Start-Process '${safe}'`);
  return `Opened ${target}`;
}

/** Move the cursor to a normalized (0-1) point on the primary screen and click. */
async function click(nx, ny, button = "left") {
  const d = screen.getPrimaryDisplay();
  const sf = d.scaleFactor || 1;
  const x = Math.round(Math.min(1, Math.max(0, nx)) * d.size.width * sf);
  const y = Math.round(Math.min(1, Math.max(0, ny)) * d.size.height * sf);
  const down = button === "right" ? 0x0008 : 0x0002;
  const up = button === "right" ? 0x0010 : 0x0004;

  await runPowerShell(`
    Add-Type @'
    using System;
    using System.Runtime.InteropServices;
    public class M {
      [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
      [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint x, uint y, uint d, int e);
    }
'@
    [M]::SetCursorPos(${x}, ${y})
    Start-Sleep -Milliseconds 60
    [M]::mouse_event(${down}, 0, 0, 0, 0)
    [M]::mouse_event(${up}, 0, 0, 0, 0)
  `);
  return `Clicked (${nx.toFixed(2)}, ${ny.toFixed(2)})`;
}

/** SendKeys needs these characters escaped so they aren't read as commands. */
function escapeSendKeys(text) {
  return String(text).replace(/([+^%~(){}[\]])/g, "{$1}");
}

/** Type literal text into whatever is focused. */
async function typeText(text) {
  const keys = escapeSendKeys(text).replace(/'/g, "''");
  await runPowerShell(`
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.SendKeys]::SendWait('${keys}')
  `);
  return `Typed "${text.slice(0, 40)}${text.length > 40 ? "…" : ""}"`;
}

/**
 * Press a named key or chord. Accepts SendKeys syntax names like ENTER, TAB,
 * ESC, or a chord like "^c" / "%{F4}". A few friendly aliases are mapped.
 */
async function pressKey(key) {
  const map = {
    enter: "{ENTER}",
    tab: "{TAB}",
    escape: "{ESC}",
    esc: "{ESC}",
    backspace: "{BACKSPACE}",
    delete: "{DELETE}",
    up: "{UP}",
    down: "{DOWN}",
    left: "{LEFT}",
    right: "{RIGHT}",
    space: " ",
    copy: "^c",
    paste: "^v",
    cut: "^x",
    selectall: "^a",
    save: "^s",
  };
  const seq = map[String(key).toLowerCase()] ?? key;
  const safe = String(seq).replace(/'/g, "''");
  await runPowerShell(`
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.SendKeys]::SendWait('${safe}')
  `);
  return `Pressed ${key}`;
}

module.exports = { openApp, click, typeText, pressKey, runPowerShell };
