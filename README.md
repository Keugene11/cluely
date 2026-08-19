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

## Not included

The real product's headline feature is a native desktop overlay that hides itself from
screen-share and recording. That is a native GPU-layer trick, and building software to evade
meeting recording or exam proctoring is out of scope here. This clone runs in the browser,
in plain sight, and everything it captures is visible on screen.

## Setup

```bash
pnpm install
cp .env.example .env.local   # fill in the three values
pnpm db:push                 # apply src/db/schema.sql to Neon
pnpm dev
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
src/
  app/
    page.tsx              landing
    login, signup         auth screens
    app/                  the product
      page.tsx            session history
      live/               live session + assist overlay
      s/[id]/             transcript, assists, generated notes
      context/            context file manager
    api/
      auth/               signup, login, logout
      sessions/           CRUD, transcript append, notes generation
      assist/             streaming hotkey answers
      context/            context files
  lib/
    db.ts                 Neon client and row types
    auth.ts               password hashing, JWT cookie, getUser/requireUser
    claude.ts             Anthropic client and the two system prompts
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
