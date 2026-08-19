import Link from "next/link";
import {
  ArrowLeft,
  Download,
  Keyboard,
  MonitorDown,
  ShieldQuestion,
  Sparkles,
} from "lucide-react";
import { Nav } from "@/components/nav";

// The installer lives on the repo's latest GitHub Release under a stable name.
const DOWNLOAD_URL =
  "https://github.com/Keugene11/cluely/releases/latest/download/Otto-Setup.exe";
const RELEASES_URL = "https://github.com/Keugene11/cluely/releases";

const steps = [
  {
    n: "1",
    title: "Download and run the installer",
    body: "It is not code-signed yet, so Windows SmartScreen may warn you. Click “More info” then “Run anyway.”",
  },
  {
    n: "2",
    title: "Sign in",
    body: "Use the same account as the web app — the panel is small, so there is a compact sign-in built in.",
  },
  {
    n: "3",
    title: "Start a session and press Ctrl + Enter",
    body: "The panel floats over your other windows. The hotkey works whether or not it has focus.",
  },
];

export default function DownloadPage() {
  return (
    <>
      <Nav />

      <main className="flex-1">
        <section className="aurora grain relative overflow-hidden border-b border-line/60">
          <div className="mx-auto max-w-4xl px-5 pb-16 pt-16 md:pb-24 md:pt-24">
            <Link
              href="/"
              className="press inline-flex items-center gap-2 text-sm text-muted hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Home
            </Link>

            <div className="mt-8 max-w-2xl">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-xs text-muted backdrop-blur">
                <MonitorDown className="h-3.5 w-3.5" />
                Desktop app · Windows
              </div>

              <h1 className="text-balance text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
                Put Otto on your desktop
              </h1>
              <p className="mt-5 max-w-xl text-lg text-muted">
                The desktop app is a small panel that floats over your calls, answers on a global
                hotkey, and can hide itself from screen shares. The web app keeps working in your
                browser either way.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <a
                  href={DOWNLOAD_URL}
                  className="press inline-flex items-center justify-center gap-2 rounded-full bg-foreground px-6 py-3.5 font-medium text-background"
                >
                  <Download className="h-4 w-4" />
                  Download for Windows
                </a>
                <a
                  href={RELEASES_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="press inline-flex items-center justify-center gap-2 rounded-full border border-line bg-surface/60 px-6 py-3.5 font-medium backdrop-blur hover:bg-surface-2"
                >
                  All releases
                </a>
              </div>

              <p className="mt-4 text-xs text-muted">
                Windows 10 (2004+) or 11 · x64 · about 160&nbsp;MB. macOS build coming once it can be
                notarized.
              </p>
            </div>
          </div>
        </section>

        <section className="border-b border-line/60">
          <div className="mx-auto max-w-4xl px-5 py-16 md:py-20">
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Getting set up</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {steps.map((s) => (
                <div key={s.n} className="card p-6">
                  <span className="text-xs text-muted">{s.n}</span>
                  <h3 className="mt-3 font-medium">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-line/60">
          <div className="mx-auto max-w-4xl px-5 py-16 md:py-20">
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
              What the desktop app adds
            </h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <div className="card p-6">
                <Keyboard className="h-5 w-5" />
                <h3 className="mt-4 font-medium">A global hotkey</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  Ctrl + Enter answers from anywhere. Ctrl + Shift + Space hides the panel; the arrow
                  keys nudge it around.
                </p>
              </div>
              <div className="card p-6">
                <Sparkles className="h-5 w-5" />
                <h3 className="mt-4 font-medium">A floating panel</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  Frameless and always on top, so it sits over Zoom or Meet without joining the call
                  as a bot.
                </p>
              </div>
              <div className="card p-6">
                <ShieldQuestion className="h-5 w-5" />
                <h3 className="mt-4 font-medium">Hide from capture</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  An optional toggle keeps the panel out of screen shares and recordings. It is off by
                  default and is not a security guarantee — a phone still sees your screen.
                </p>
              </div>
            </div>

            <p className="mt-8 max-w-2xl text-sm text-muted">
              A note on honesty: this build does nothing to hide from proctoring or monitoring
              software, and the capture toggle does not work against apps that record through
              ScreenCaptureKit on current macOS. Use it where the people you are talking to know it
              is on.
            </p>
          </div>
        </section>

        <section>
          <div className="mx-auto max-w-4xl px-5 py-16 text-center md:py-24">
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
              Prefer the browser?
            </h2>
            <p className="mx-auto mt-4 max-w-md text-muted">
              Everything except the global hotkey and the floating panel works at the web app.
            </p>
            <Link
              href="/app/live"
              className="press mt-7 inline-flex items-center gap-2 rounded-full border border-line px-6 py-3 font-medium hover:bg-surface-2"
            >
              Open the web app
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-10 text-sm text-muted sm:flex-row">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            <span>Otto</span>
          </div>
          <p>A study build. Use it where everyone in the room knows it is on.</p>
        </div>
      </footer>
    </>
  );
}
