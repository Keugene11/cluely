// Windows computer control. Uses Win32 P/Invoke through PowerShell so it needs
// no native modules — but through ONE long-lived PowerShell process, not a new
// one per action. Spawning powershell.exe costs 200-400ms, which is the
// difference between a cursor that clicks and a cursor that lags; on the warm
// host a command round-trips in about a millisecond.
const { spawn, execFile } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app, screen } = require("electron");

/**
 * The host script. Two things here are load-bearing and were arrived at the
 * hard way:
 *
 *  - It runs via `-File`, not `-Command -`. Piping a script into `-Command -`
 *    makes PowerShell evaluate stdin line by line (which tears apart the
 *    multi-line here-string below) AND hold all output until stdin closes,
 *    which is useless for a request/response host.
 *  - It writes through [Console]::Out and flushes by hand, so a reply arrives
 *    when the command finishes rather than whenever the pipe feels like it.
 *
 * The move/click primitives live in C# so a glide runs as a tight native loop
 * instead of a PowerShell one — that is what makes the real pointer travel
 * smoothly instead of stuttering between hops.
 */
const HOST_SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class OttoInput {
  [StructLayout(LayoutKind.Sequential)] public struct PT { public int X; public int Y; }
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out PT p);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint x, uint y, uint d, int e);

  // easeInOutCubic, the same curve the drawn cursor uses, so the real pointer
  // and the one on screen stay together for the whole trip.
  static double Ease(double t) { return t < 0.5 ? 4*t*t*t : 1 - Math.Pow(-2*t + 2, 3) / 2; }

  public static string Pos() { PT p; GetCursorPos(out p); return p.X + "," + p.Y; }

  public static void Glide(int tx, int ty, int ms) {
    PT s; GetCursorPos(out s);
    if (ms < 16) { SetCursorPos(tx, ty); return; }
    var w = System.Diagnostics.Stopwatch.StartNew();
    while (w.ElapsedMilliseconds < ms) {
      double e = Ease((double)w.ElapsedMilliseconds / ms);
      SetCursorPos((int)Math.Round(s.X + (tx - s.X) * e), (int)Math.Round(s.Y + (ty - s.Y) * e));
      System.Threading.Thread.Sleep(6);
    }
    SetCursorPos(tx, ty);
  }

  public static void Click(bool right) {
    uint down = right ? (uint)0x0008 : (uint)0x0002;
    uint up   = right ? (uint)0x0010 : (uint)0x0004;
    mouse_event(down, 0, 0, 0, 0);
    System.Threading.Thread.Sleep(28); // a human-length press; some apps ignore a 0ms one
    mouse_event(up, 0, 0, 0, 0);
  }
}
'@
[Console]::Out.WriteLine("OTTO-READY")
[Console]::Out.Flush()
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line -or $line -eq 'OTTO-EXIT') { break }
  $split = $line.IndexOf('|')
  if ($split -lt 1) { continue }
  $id = $line.Substring(0, $split)
  $cmd = $line.Substring($split + 1)
  try {
    $out = Invoke-Expression $cmd
    [Console]::Out.WriteLine("OTTO-OK:" + $id + ":" + $out)
  } catch {
    [Console]::Out.WriteLine("OTTO-ERR:" + $id + ":" + $_.Exception.Message)
  }
  [Console]::Out.Flush()
}
`;

let host = null;
let ready = null;
let seq = 0;
const waiting = new Map(); // id -> { resolve, reject }

/** Where to drop the host script. It cannot live inside the asar archive. */
function scriptPath() {
  const dir = app?.getPath ? app.getPath("userData") : os.tmpdir();
  const file = path.join(dir, "otto-input-host.ps1");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, HOST_SCRIPT, "utf8"); // rewritten each launch so an update lands
  return file;
}

/** Spawn (or reuse) the PowerShell host. Resolves once it reports OTTO-READY. */
function ensureHost() {
  if (host && host.exitCode === null && !host.killed) return ready;
  if (process.platform !== "win32") {
    return Promise.reject(new Error("Controlling the mouse is Windows-only for now."));
  }

  host = spawn(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-NoLogo", "-ExecutionPolicy", "Bypass", "-File", scriptPath()],
    { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
  );

  let settle;
  ready = new Promise((resolve, reject) => {
    settle = { resolve, reject };
    setTimeout(() => reject(new Error("The input helper did not start.")), 20000);
  });

  let buffer = "";
  host.stdout.setEncoding("utf8");
  host.stdout.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const raw of lines) {
      const line = raw.trim();
      if (line === "OTTO-READY") {
        settle.resolve();
        continue;
      }
      const ok = line.match(/^OTTO-OK:(\d+):?([\s\S]*)$/);
      const err = line.match(/^OTTO-ERR:(\d+):([\s\S]*)$/);
      if (ok) {
        waiting.get(Number(ok[1]))?.resolve(ok[2]);
        waiting.delete(Number(ok[1]));
      } else if (err) {
        waiting.get(Number(err[1]))?.reject(new Error(err[2] || "That action failed."));
        waiting.delete(Number(err[1]));
      }
    }
  });
  host.stderr.resume(); // PowerShell's own noise is not interesting

  const die = (reason) => {
    settle.reject(new Error(reason));
    for (const [, p] of waiting) p.reject(new Error(reason));
    waiting.clear();
    host = null;
  };
  host.on("exit", () => die("The input helper stopped."));
  host.on("error", () => die("Could not start the input helper."));

  return ready;
}

/** Run one statement in the host and resolve with whatever it printed. */
async function run(statement, timeoutMs = 15000) {
  await ensureHost();
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => {
      waiting.delete(id);
      reject(new Error("That took too long."));
    }, timeoutMs);

    waiting.set(id, {
      resolve: (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      reject: (err) => {
        clearTimeout(timer);
        reject(err);
      },
    });

    // One line in, one tagged line out — errors come back against the same id
    // instead of vanishing into the host's stderr.
    host.stdin.write(`${id}|${statement}\n`);
  });
}

/** Launch an app or open a URL/path. Stays a one-shot process — it can block. */
function openApp(target) {
  const safe = String(target).replace(/'/g, "''");
  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", `Start-Process '${safe}'`],
      { windowsHide: true, timeout: 15000 },
      (err, _stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message));
        else resolve(`Opened ${target}`);
      },
    );
  });
}

const clamp01 = (n) => Math.min(1, Math.max(0, Number(n) || 0));

/** Normalized (0-1) point on the primary display -> physical screen pixels. */
function toPhysical(nx, ny) {
  const d = screen.getPrimaryDisplay();
  const sf = d.scaleFactor || 1;
  return {
    x: Math.round((d.bounds.x + clamp01(nx) * d.size.width) * sf),
    y: Math.round((d.bounds.y + clamp01(ny) * d.size.height) * sf),
  };
}

/** Slide the real pointer to a normalized point over `ms`, without clicking. */
async function glideTo(nx, ny, ms = 380) {
  const { x, y } = toPhysical(nx, ny);
  const span = Math.max(0, Math.round(ms));
  await run(`[OttoInput]::Glide(${x}, ${y}, ${span})`, span + 10000);
  return { x, y };
}

/** Glide to a normalized point and press. This is the one that touches apps. */
async function click(nx, ny, button = "left", glideMs = 380) {
  await glideTo(nx, ny, glideMs);
  await run(`[OttoInput]::Click($${button === "right" ? "true" : "false"})`);
  return `Clicked ${button === "right" ? "right " : ""}(${clamp01(nx).toFixed(3)}, ${clamp01(ny).toFixed(3)})`;
}

/**
 * Warm the host up in the background. Loading the C# takes ~600ms once; doing
 * it lazily would spend that on the user's first click, which is exactly the
 * moment it is most visible.
 */
function warmUp() {
  if (process.platform !== "win32") return;
  ensureHost().catch(() => {}); // it will be retried, and reported, on real use
}

/** Let the host go at quit time rather than leaving a stray powershell.exe. */
function shutdown() {
  try {
    host?.stdin.write("OTTO-EXIT\n");
  } catch {
    /* already gone */
  }
  host?.kill();
  host = null;
}

module.exports = { openApp, click, glideTo, warmUp, shutdown };
