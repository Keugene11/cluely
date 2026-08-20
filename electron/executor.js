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
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr ctx);

  /**
   * Without this, every coordinate below is a lie on any display not at 100%.
   * Windows silently rescales coordinates from a DPI-unaware process, so on a
   * 125% screen the caller's physical 1280 becomes a real 1600 — and since
   * toPhysical() has ALREADY multiplied by the scale factor, the error is the
   * scale factor squared. Clicks land low and right, and past about x=0.8 they
   * leave the screen entirely.
   *
   * PerMonitorV2 first so a second monitor at a different scale is also right;
   * the older call is the fallback on Windows before 1703. Both are no-ops if
   * awareness is already set, and it must happen before any window or input.
   */
  public static void MakeDpiAware() {
    try { if (SetProcessDpiAwarenessContext(new IntPtr(-4))) return; } catch { }
    try { SetProcessDPIAware(); } catch { }
  }

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

  public static void DoubleClick() {
    Click(false);
    System.Threading.Thread.Sleep(60); // inside the default 500ms double-click window
    Click(false);
  }

  // Press, glide, release. Editing timelines is all drag, and a drag is not a
  // click plus a move: the button has to stay down for the whole trip or the
  // app reads it as a click and then a hover. The sleeps around the ends are
  // what make apps register the grab -- dropping them makes drags silently
  // no-op in CapCut about half the time.
  public static void Drag(int fx, int fy, int tx, int ty, int ms) {
    SetCursorPos(fx, fy);
    System.Threading.Thread.Sleep(90);
    mouse_event(0x0002, 0, 0, 0, 0); // left down
    System.Threading.Thread.Sleep(90);
    Glide(tx, ty, ms < 120 ? 120 : ms); // never teleport: a jump can miss drop targets
    System.Threading.Thread.Sleep(90);
    mouse_event(0x0004, 0, 0, 0, 0); // left up
  }

  // One notch is 120. Positive scrolls up/away from the user.
  public static void Scroll(int notches) {
    mouse_event(0x0800, 0, 0, (uint)(notches * 120), 0);
  }

  // --- keyboard -------------------------------------------------------
  // SendInput rather than keybd_event so text goes in as real unicode and does
  // not depend on the active layout -- a caption typed on an AZERTY machine
  // lands the same as on QWERTY.
  [StructLayout(LayoutKind.Sequential)] public struct KI {
    public ushort vk; public ushort scan; public uint flags; public uint time; public IntPtr extra;
  }
  [StructLayout(LayoutKind.Sequential)] public struct IN {
    public uint type; public KI ki; public int pad1; public int pad2;
  }
  [DllImport("user32.dll")] static extern uint SendInput(uint n, IN[] a, int cb);
  [DllImport("user32.dll")] static extern short VkKeyScan(char c);

  static void Send(ushort vk, ushort scan, uint flags) {
    var a = new IN[1];
    a[0].type = 1; // INPUT_KEYBOARD
    a[0].ki = new KI { vk = vk, scan = scan, flags = flags, time = 0, extra = IntPtr.Zero };
    SendInput(1, a, Marshal.SizeOf(typeof(IN)));
  }

  // Text arrives base64'd. The host dispatches through Invoke-Expression, so a
  // raw string argument would be an injection hole the first time a caption
  // contained a quote; base64's alphabet cannot terminate the literal.
  public static void TypeB64(string b64) {
    string s = System.Text.Encoding.UTF8.GetString(Convert.FromBase64String(b64));
    foreach (char c in s) {
      // The escape below is doubled on purpose. This C# lives inside a JS
      // template literal, so a single backslash is consumed by JS and C# ends up
      // with a real line break inside a character constant -- Add-Type fails
      // with "Newline in constant", the host dies on startup, and every input
      // action reports "The input helper stopped". Do not simplify it, and do
      // not write the single-backslash form anywhere in this string, comments
      // included.
      if (c == '\\n') { Send(0x0D, 0, 0); Send(0x0D, 0, 2); continue; } // VK_RETURN
      Send(0, c, 0x0004);          // KEYEVENTF_UNICODE down
      Send(0, c, 0x0004 | 0x0002); // ...and up
      System.Threading.Thread.Sleep(8); // editors drop characters typed faster
    }
  }

  static ushort NameToVk(string n) {
    switch (n) {
      case "ctrl": return 0x11; case "shift": return 0x10; case "alt": return 0x12;
      case "win": return 0x5B;  case "enter": return 0x0D; case "tab": return 0x09;
      case "esc": return 0x1B;  case "space": return 0x20; case "backspace": return 0x08;
      case "delete": return 0x2E; case "home": return 0x24; case "end": return 0x23;
      case "left": return 0x25; case "up": return 0x26;
      case "right": return 0x27; case "down": return 0x28;
    }
    if (n.Length == 1) { short v = VkKeyScan(n[0]); if (v != -1) return (ushort)(v & 0xFF); }
    if (n.Length > 1 && n[0] == 'f') { int fn; if (int.TryParse(n.Substring(1), out fn) && fn >= 1 && fn <= 24) return (ushort)(0x6F + fn); }
    return 0;
  }

  // "ctrl+shift+k" -- modifiers held, final key tapped, then released in
  // reverse so nothing is left stuck down if the caller sends garbage.
  public static void Combo(string spec) {
    string[] parts = spec.ToLowerInvariant().Split('+');
    var held = new System.Collections.Generic.List<ushort>();
    for (int i = 0; i < parts.Length; i++) {
      ushort vk = NameToVk(parts[i].Trim());
      if (vk == 0) continue;
      if (i < parts.Length - 1) { Send(vk, 0, 0); held.Add(vk); }
      else { Send(vk, 0, 0); System.Threading.Thread.Sleep(30); Send(vk, 0, 2); }
    }
    held.Reverse();
    foreach (ushort vk in held) Send(vk, 0, 2); // KEYEVENTF_KEYUP
  }
}
'@
[OttoInput]::MakeDpiAware()
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

/**
 * Kernel anti-cheat drivers, and the games that load them.
 *
 * Otto moves the mouse with mouse_event and types with SendInput. To an
 * anti-cheat that is not "automation", it is the exact signature of a cheat
 * tool, and the penalty lands on the user's account rather than on us. No
 * feature is worth someone's Steam or FACEIT ban, so input is refused outright
 * while any of these is live instead of being left to judgement in the moment.
 */
/*
 * Wildcards, not exact names — found the hard way. This list originally read
 * "FACEIT" and "FACEITService"; the processes actually running were
 * "faceitclient" and "faceitservice", so Get-Process -Name matched neither and
 * the guard sailed straight past a live anti-cheat. Vendors rename these between
 * versions, so match the family and accept the odd false positive: refusing to
 * click is a nuisance, missing an anti-cheat costs someone their account.
 */
const ANTI_CHEAT = [
  "faceit*", // faceitclient, faceitservice, FACEIT AC
  "vgc", "vgtray", "vanguard*", // Riot Vanguard
  "EasyAntiCheat*", "start_protected_game", // EAC
  "BEService*", "BEDaisy", // BattlEye
  "cs2", "csgo", "valorant*", "r5apex*", "FortniteClient*",
];

let gameCheck = { at: 0, found: null };

/**
 * Ask the host which of the above are running. Cached briefly: this sits in
 * front of every action, and a fresh process sweep per click would cost more
 * than the click.
 */
async function blockingGame() {
  if (Date.now() - gameCheck.at < 5000) return gameCheck.found;
  const names = ANTI_CHEAT.map((n) => `'${n}'`).join(",");
  let found = null;
  try {
    const out = await run(
      `@(Get-Process -Name @(${names}) -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Name)`,
      8000,
    );
    found = out && out.trim() ? out.trim() : null;
  } catch {
    found = null; // a failed check must not brick input entirely
  }
  gameCheck = { at: Date.now(), found };
  return found;
}

/** Throws when input would be unsafe to send. Every action goes through this. */
async function assertInputAllowed() {
  const game = await blockingGame();
  if (!game) return;
  throw new Error(
    `${game} is running. I can't move the mouse or type while anti-cheat software is active — it looks like a cheat tool and could get your account banned. Close it and try again.`,
  );
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

/**
 * Launch an app or open a URL/path. Stays a one-shot process — it can block.
 *
 * Start-Process alone only finds things on PATH, registered protocols, and App
 * Paths — which is almost no ordinary desktop software. "capcut", "discord",
 * "spotify" as an installed exe all fail with "cannot find the file specified".
 * So when the direct attempt fails we look the name up the way a person would:
 * by its Start Menu shortcut. That covers anything with an entry in the
 * launcher, which is essentially everything installed.
 *
 * URLs are left alone — they resolve through the browser and must not be
 * dragged through a shortcut search.
 */
function openApp(target) {
  const raw = String(target);
  const safe = raw.replace(/'/g, "''");
  const isUrl = /^[a-z][a-z0-9+.-]*:/i.test(raw);

  const script = isUrl
    ? `Start-Process '${safe}'`
    : `
try { Start-Process '${safe}' -ErrorAction Stop; exit 0 } catch { }
$roots = @(
  (Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs'),
  (Join-Path $env:ProgramData 'Microsoft\\Windows\\Start Menu\\Programs')
) | Where-Object { Test-Path $_ }
$hits = Get-ChildItem -Path $roots -Recurse -Filter *.lnk -ErrorAction SilentlyContinue |
  Where-Object { $_.BaseName -like '*${safe}*' }
# Rank rather than take any substring hit. A bare "contains" match will happily
# launch the wrong program -- "notepad" matches "Mic Note - Voice Recorder &
# Notepad" -- so an exact name wins, then one that starts with the target, and
# only then a match somewhere inside. Shortest name breaks ties, so "CapCut"
# beats "CapCut Uninstaller".
$rank = { if ($_.BaseName -eq '${safe}') { 0 } elseif ($_.BaseName -like '${safe}*') { 1 } else { 2 } }
$len = { $_.BaseName.Length }
$pick = $hits | Sort-Object $rank, $len | Select-Object -First 1
if ($pick) { Start-Process $pick.FullName; exit 0 }
Write-Error "Could not find '${safe}' installed."
exit 1`;

  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { windowsHide: true, timeout: 20000 },
      (err, _stdout, stderr) => {
        if (err) reject(new Error((stderr || err.message).trim()));
        else resolve(`Opened ${raw}`);
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
  await assertInputAllowed();
  const { x, y } = toPhysical(nx, ny);
  const span = Math.max(0, Math.round(ms));
  await run(`[OttoInput]::Glide(${x}, ${y}, ${span})`, span + 10000);
  return { x, y };
}

/** Glide to a normalized point and press. This is the one that touches apps. */
async function click(nx, ny, button = "left", glideMs = 380) {
  await assertInputAllowed();
  await glideTo(nx, ny, glideMs);
  await run(`[OttoInput]::Click($${button === "right" ? "true" : "false"})`);
  return `Clicked ${button === "right" ? "right " : ""}(${clamp01(nx).toFixed(3)}, ${clamp01(ny).toFixed(3)})`;
}

/** Glide somewhere and double-click. Opening things in file lists needs this. */
async function doubleClick(nx, ny, glideMs = 380) {
  await assertInputAllowed();
  await glideTo(nx, ny, glideMs);
  await run(`[OttoInput]::DoubleClick()`);
  return `Double-clicked (${clamp01(nx).toFixed(3)}, ${clamp01(ny).toFixed(3)})`;
}

/**
 * Press at one normalized point, travel, release at another. This is the
 * primitive every timeline edit is built from — trimming a clip, sliding it
 * along the track, pulling a file into the app.
 */
async function drag(fromX, fromY, toX, toY, ms = 700) {
  await assertInputAllowed();
  const a = toPhysical(fromX, fromY);
  const b = toPhysical(toX, toY);
  const span = Math.max(120, Math.round(ms));
  await run(`[OttoInput]::Drag(${a.x}, ${a.y}, ${b.x}, ${b.y}, ${span})`, span + 15000);
  return `Dragged (${clamp01(fromX).toFixed(3)}, ${clamp01(fromY).toFixed(3)}) -> (${clamp01(toX).toFixed(3)}, ${clamp01(toY).toFixed(3)})`;
}

/** Wheel notches at a point — positive scrolls away from the user. */
async function scroll(nx, ny, notches = -3) {
  await assertInputAllowed();
  await glideTo(nx, ny, 260);
  await run(`[OttoInput]::Scroll(${Math.trunc(Number(notches) || 0)})`);
  return `Scrolled ${notches}`;
}

/**
 * Type literal text. Base64 on this side because the host dispatches through
 * Invoke-Expression — an apostrophe in a caption would otherwise end the
 * PowerShell string and run whatever followed it.
 */
async function typeText(text) {
  await assertInputAllowed();
  const s = String(text ?? "");
  if (!s) return "Nothing to type";
  const b64 = Buffer.from(s, "utf8").toString("base64");
  await run(`[OttoInput]::TypeB64('${b64}')`, 15000 + s.length * 60);
  return `Typed ${s.length} character${s.length === 1 ? "" : "s"}`;
}

/** A shortcut, e.g. "ctrl+i" or "ctrl+shift+left" or "delete". */
async function pressKeys(combo) {
  await assertInputAllowed();
  // Only the characters a combo can legitimately contain, so nothing reaches
  // Invoke-Expression that could close the quote.
  const spec = String(combo ?? "").trim().toLowerCase();
  if (!/^[a-z0-9+\s]{1,40}$/.test(spec)) {
    throw new Error(`Not a key combination: ${combo}`);
  }
  await run(`[OttoInput]::Combo('${spec}')`);
  return `Pressed ${spec}`;
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

module.exports = {
  openApp,
  click,
  doubleClick,
  drag,
  scroll,
  typeText,
  pressKeys,
  glideTo,
  warmUp,
  shutdown,
};
