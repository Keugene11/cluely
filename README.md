# Otto

A working clone of the Otto product — a copilot that sits in a small always-on-top panel,
sees your screen, and helps with whatever is in front of you. Ask it a question and it
answers. Ask it to do something and it takes on the app you are in, one step at a time,
flying a cursor to the exact control — and pressing it for you if you want.

Built with Next.js (App Router), Electron, Neon Postgres, and Claude.

## What it does

You never pick a mode. Every request goes through one Claude call (`/api/ask`) that looks at
your screen, the live transcript and your uploaded context, and decides between three things:

- **Answer** — a coding problem, a question on screen, a multiple-choice item, or the thing
  that was just asked of you in a call. Streams into the panel as markdown.
- **Open** — launch an app, a site, or a search.
- **Guide** — the work happens inside an application, so take it step by step.

### Guiding

A walkthrough (`/api/guide`) runs a loop, once per step, each turn against a **fresh
screenshot**:

- **Point** — Claude returns the one element for the current step as a normalized `x`/`y`
  plus a label. A separate full-screen, click-through Electron window (`/guide-cursor`) draws
  a cursor that glides to that spot over whatever app you are in.
- **Speak** — the step is narrated aloud through speech synthesis, so you can keep your eyes
  on the app rather than on the panel.
- **Act** — a step can also carry actions: click, double-click, type, key combo, scroll, drag,
  or focus an app. These are real input on your machine, not a simulation.
- **Verify** — each step declares what will be *visibly true* on screen once it worked
  (`expect`). The next turn looks at the new screenshot and answers whether that actually
  happened (`happened`) before moving on, so a missed click is retried rather than silently
  skipped.

Guiding needs a screenshot, so it exists only in the desktop app. The `guide` tool is dropped
from the request entirely when no screen is attached, rather than left in the prompt to be
talked out of.

### Meetings

The same panel handles calls:

- **Live transcript** — browser speech recognition transcribes locally and streams lines into
  Neon in batches. No bot joins the meeting, so nothing appears in the roster.
- **Hotkey assist** — `Ctrl`/`Cmd`+`Enter` answers using the recent transcript plus your
  uploaded context. Every assist is stored against the session.
- **Meeting notes** — ending a session generates a summary, key points, action items with
  owners, and a follow-up email draft, stored as JSONB.
- **Context files** — paste or upload text the assistant reads before answering. The five most
  recent are included in every live assist; Starter plans are capped at three.

## Computer control

`electron/executor.js` is the part that actually moves the mouse. It uses Win32 P/Invoke
through PowerShell, so there are no native modules to build — but through **one long-lived
PowerShell process**, not a new one per action. Spawning `powershell.exe` costs 200-400ms,
which is the difference between a cursor that clicks and a cursor that lags; on the warm host
a command round-trips in about a millisecond. The move and click primitives are C# so a glide
runs as a tight native loop rather than a PowerShell one — that is what makes the real pointer
travel smoothly instead of stuttering between hops.

Typing goes in through `SendInput` as real Unicode, so it is not limited to ASCII and does not
depend on the target app's keyboard handling.

**What it will not do.** Nothing in an automated step may destroy work, spend money, send a
message, or post anything publicly. Those get described for you to do yourself. It also never
aims at a window's title bar or its minimise/maximise/close buttons — they sit within a few
pixels of each other, and a click that drifts there minimises the app you are working in,
which then looks to the model like the app closed, and the run falls apart chasing it.
Bringing an app forward uses a `focus` action rather than a taskbar click, because a taskbar
button toggles: the second click minimises the window the first one restored.

Only one action per turn may use a coordinate, and it has to go first. Once it runs the screen
may have moved, so any later coordinate was read from a screenshot that is no longer true —
those are dropped. `type` and `key` go to whatever has focus, so they chain safely after it:
click the search box, type the query, press enter is one good turn.

Windows only, for now.

## Desktop overlay

`pnpm desktop` runs the app inside an Electron shell as a frameless, always-on-top panel that
floats over your other windows (even full-screen ones). The web `/app` and the overlay share
one hook (`src/hooks/use-live-session.ts`); the overlay is the compact view with the
desktop-only extras:

- **Global hotkeys** — they fire whether or not Otto has focus.
- **Drag anywhere, click-through** — grab the header to move it; `Ctrl+Shift+H` lets clicks
  pass through to whatever is underneath.
- **Hide from screen capture** — the eye toggle calls `win.setContentProtection(true)`, which
  is `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)` on Windows and
  `NSWindow.sharingType = .none` on macOS. It is **off by default**, and it is not a security
  boundary: a phone pointed at the screen still sees everything, and on current macOS apps
  that capture via ScreenCaptureKit (Zoom, Teams) see the window anyway — the overlay says so
  when you turn it on there.

| Shortcut | What it does |
| --- | --- |
| `Ctrl/Cmd+Enter` | Assist — answer, open, or start a walkthrough |
| `Ctrl/Cmd+Shift+G` | Ask by voice, then guide with the cursor |
| `Ctrl/Cmd+Shift+Space` | Show / hide the panel |
| `Ctrl/Cmd+Shift+H` | Click-through on/off |
| `Ctrl/Cmd+Shift+Arrows` | Nudge the panel |
| `Ctrl/Cmd+Shift+Q` | Quit, whatever the panel is showing |

## Try it

- **Public demo:** https://cluely-delta.vercel.app/demo — share a tab and ask about what is on
  it. No sign-up. A browser tab cannot move your mouse or launch anything, so the demo has no
  microphone, no transcript and no tools: a walkthrough that offers to click for you and then
  cannot is a worse demo than one that never offers. It is rate-limited per IP.
- **Web app:** https://cluely-delta.vercel.app
- **Windows installer:** https://cluely-delta.vercel.app/download → the latest GitHub Release
  (`Otto-Setup.exe`, Windows 10 2004+ / 11, x64).

## Download & distribution

The desktop app is a thin shell that loads the hosted web app, so distribution is two moving
parts:

1. **Backend on Vercel.** `next build` deploys with `DATABASE_URL`, `ANTHROPIC_API_KEY`, and
   `AUTH_SECRET` set as production env vars. `.vercelignore` keeps the Electron build
   artifacts out of the upload.
2. **Installer on GitHub Releases.** `pnpm dist` builds the NSIS installer with
   electron-builder; the packaged app points at the hosted URL baked into
   `electron/config.js`. Uploading it as `Otto-Setup.exe` on the latest release makes the
   download page's permalink work across versions.

```bash
pnpm dist          # build/icon.png + dist-desktop/Otto Setup <version>.exe

# cut a release (asset renamed to the stable name the download page links to)
cp "dist-desktop/Otto Setup 0.1.0.exe" dist-desktop/Otto-Setup.exe
gh release create v0.1.0 dist-desktop/Otto-Setup.exe --title "Otto 0.1.0"
```

The installer is **not code-signed**, so Windows SmartScreen warns on first run (More info →
Run anyway). Signing needs a code-signing certificate; a macOS build additionally needs a Mac
to notarize, which is why only Windows ships today.

## Not built on purpose

The real product sells a "Pro + Undetectability" tier aimed at staying hidden from
**proctoring and integrity software** — process-name obfuscation, hiding from process
enumeration, dodging detection tools. That is not in here. It exists only to defeat exam and
interview monitoring, and it does not even work the way the marketing implies: detection
happens out-of-band (process lists, virtual-audio devices, network calls), not through the
screen, so hiding pixels does nothing against it. The screen-capture exclusion above is the
same API password managers use and stops there.

## Setup

```bash
pnpm install
cp .env.example .env.local   # fill in the three values
pnpm db:push                 # apply src/db/schema.sql to Neon

pnpm dev                     # web app at http://localhost:3000
pnpm desktop                 # or the Electron overlay (starts Next automatically)
pnpm test                    # vitest
```

| Variable            | What it is                                                    |
| ------------------- | ------------------------------------------------------------- |
| `DATABASE_URL`      | Neon Postgres connection string (use the pooled host)          |
| `ANTHROPIC_API_KEY` | Powers answers, walkthroughs, and meeting notes                |
| `AUTH_SECRET`       | Signs the session cookie — any long random string              |

Speech recognition uses the Web Speech API, so transcription needs Chrome or Edge. Other
browsers can still run a session and type questions.

## Layout

```
electron/
  main.js                 window, global shortcuts, cursor overlay, content protection, IPC
  executor.js             Win32 input host — move, click, type, key, scroll, drag, focus
  preload.js              the `window.cluely` bridge exposed to the overlay
  updater.js              electron-updater wiring
src/
  app/
    page.tsx              landing
    demo/                 the public, tool-less demo
    download/             installer permalink
    guide-cursor/         the click-through window that draws the guiding cursor
    login, signup         auth screens
    overlay/              the surface the Electron window loads
    app/                  the web product
      page.tsx            session history
      live/               live session + assist panel
      s/[id]/             transcript, assists, generated notes
      context/            context file manager
    api/
      ask/                the dispatcher — answer, open, or guide
      guide/              one walkthrough step against a fresh screenshot
      auth/               signup, login, logout
      sessions/           CRUD, transcript append, notes generation
      context/            context files
  hooks/
    use-live-session.ts   shared session logic (web + overlay), and the guide loop
  lib/
    claude.ts             Anthropic client, models, and the system prompts
    db.ts                 Neon client and row types
    auth.ts               password hashing, JWT cookie, getUser/requireUser
    demo.ts               per-IP quota for the public demo
    speech.ts             voice selection and utterance splitting
    desktop.ts            typed access to the preload bridge
  db/schema.sql           tables, applied by `pnpm db:push`
```

## Notes on the implementation

- The dispatcher and the guide are split into two models (`MODEL`, `GUIDE_MODEL`) so they can
  be tuned independently. They are the same today, but they are not the same job: one is the
  reasoning the user actually reads, the other runs on the critical path between one click and
  the next, where latency is felt directly.
- Transcript lines are buffered client-side and flushed every five seconds, so a busy call is
  a handful of writes rather than one per phrase.
- Notes generation uses adaptive thinking and returns strict JSON stored on the session row.
- Browsers cut the speech stream about once a minute; the recognizer restarts itself for as
  long as the session is listening.
- Chromium returns `[]` from `speechSynthesis.getVoices()` on the first call, and its default
  voice is usually the worst one installed — so `lib/speech.ts` waits for the list and picks
  deliberately. Long utterances stall, so text is split on sentence boundaries.
- The cursor overlay is resized to the primary display on every display change. If it does not
  follow, the cursor lands somewhere else entirely.
