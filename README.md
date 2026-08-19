# Cluely

A working clone of the Cluely product — a real-time meeting copilot. It listens to a
conversation, hands you an answer on a hotkey, and writes the notes once the call ends.

Built with Next.js (App Router), Neon Postgres, and Claude.

## What it does

- **Landing page** — hero, how-it-works, features, and pricing tiers.
- **Accounts** — email + password, bcrypt hashes, JWT in an httpOnly cookie.
- **Live sessions** — browser speech recognition transcribes the call in real time and
  streams lines into Neon in batches.
- **Hotkey assist** — `Ctrl` / `Cmd` + `Enter` sends the recent transcript plus your
  uploaded context to Claude and streams a short, speakable answer into the overlay panel.
  Every assist is stored against the session.
- **Meeting notes** — ending a session generates a summary, key points, action items with
  owners, and a follow-up email draft, stored as JSONB.
- **Context files** — paste or upload text the assistant reads before answering. The five
  most recent are included in every live assist; Starter plans are capped at three.

## Desktop overlay

`pnpm desktop` runs the same app inside an Electron shell as a frameless, always-on-top
panel that floats over your other windows (even full-screen ones). The web `/app` and the
overlay share one hook (`src/hooks/use-live-session.ts`); the overlay is just a compact view
with the desktop-only extras:

- **Global `Ctrl`/`Cmd`+`Enter`** — the assist hotkey fires app-focused or not.
- **Drag anywhere, click-through** — grab the header to move it; `Ctrl+Shift+H` lets clicks
  pass through to whatever is underneath.
- **No bot in the meeting** — it transcribes locally through the mic and never joins the
  call as a participant, so nothing shows up in the roster.
- **Hide from screen capture** — the eye toggle calls `win.setContentProtection(true)`,
  which is `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)` on Windows and
  `NSWindow.sharingType = .none` on macOS. It is **off by default**, and it is not a
  security boundary: a phone pointed at the screen still sees everything, and on current
  macOS apps that capture via ScreenCaptureKit (Zoom, Teams) see the window anyway — the
  overlay says so when you turn it on there.

Shortcuts: `Ctrl/Cmd+Enter` assist · `Ctrl/Cmd+Shift+Space` show/hide · `Ctrl/Cmd+Shift+H`
click-through · `Ctrl/Cmd+Shift+Arrows` nudge the panel.

## Not built on purpose

The real product sells a "Pro + Undetectability" tier aimed at staying hidden from
**proctoring and integrity software** — process-name obfuscation, hiding from process
enumeration, dodging detection tools. That is not in here. It exists only to defeat exam
and interview monitoring, and it does not even work the way the marketing implies: detection
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
```

| Variable            | What it is                                                    |
| ------------------- | ------------------------------------------------------------- |
| `DATABASE_URL`      | Neon Postgres connection string (use the pooled host)          |
| `ANTHROPIC_API_KEY` | Powers live assists and meeting notes                          |
| `AUTH_SECRET`       | Signs the session cookie — any long random string              |

Speech recognition uses the Web Speech API, so transcription needs Chrome or Edge. Other
browsers can still run a session and type questions.

## Layout

```
electron/
  main.js                 window, global shortcuts, content protection, IPC
  preload.js              the `window.cluely` bridge exposed to the overlay
src/
  app/
    page.tsx              landing
    login, signup         auth screens
    overlay/              the surface the Electron window loads
    app/                  the web product
      page.tsx            session history
      live/               live session + assist panel
      s/[id]/             transcript, assists, generated notes
      context/            context file manager
    api/
      auth/               signup, login, logout
      sessions/           CRUD, transcript append, notes generation
      assist/             streaming hotkey answers
      context/            context files
  hooks/
    use-live-session.ts   shared session logic (web + overlay)
  components/
    overlay.tsx           the desktop panel view
  lib/
    db.ts                 Neon client and row types
    auth.ts               password hashing, JWT cookie, getUser/requireUser
    claude.ts             Anthropic client and the two system prompts
    desktop.ts            typed access to the preload bridge
  db/schema.sql           tables, applied by `pnpm db:push`
```

## Notes on the implementation

- Transcript lines are buffered client-side and flushed every five seconds, so a busy call
  is a handful of writes rather than one per phrase.
- Live assists run at `effort: "low"` with a 1024-token ceiling — the panel is meant to be
  read at a glance mid-sentence.
- Notes generation uses adaptive thinking and returns strict JSON that is stored on the
  session row.
- Browsers cut the speech stream about once a minute; the recognizer restarts itself for as
  long as the session is listening.
