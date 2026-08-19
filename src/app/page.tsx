import Link from "next/link";
import {
  ArrowRight,
  Check,
  FileText,
  Keyboard,
  Languages,
  Mic,
  MonitorSmartphone,
  MoveDiagonal,
  Sparkles,
  Timer,
  Upload,
} from "lucide-react";
import { Nav } from "@/components/nav";

const features = [
  {
    icon: Mic,
    title: "Hears the whole room",
    body: "Captures your mic and the other side of the call, so the assistant always knows what was just asked.",
  },
  {
    icon: Keyboard,
    title: "One hotkey, one answer",
    body: "Ctrl + Enter reads the last stretch of conversation and puts a speakable answer on screen.",
  },
  {
    icon: MoveDiagonal,
    title: "Stays out of the way",
    body: "A small panel you can drag anywhere, sized to be read in a glance instead of studied.",
  },
  {
    icon: Upload,
    title: "Briefed before you start",
    body: "Drop in the deal notes, the job description, or the spec. Every answer is grounded in your files.",
  },
  {
    icon: FileText,
    title: "Notes without note-taking",
    body: "The moment you end a session you get a summary, the decisions, the owners, and a draft follow-up.",
  },
  {
    icon: MonitorSmartphone,
    title: "Works alongside your calls",
    body: "No bot joins the meeting and nothing to install for the other side. It runs next to Zoom, Meet, or Teams.",
  },
];

const steps = [
  {
    step: "01",
    icon: Mic,
    title: "Start a session",
    body: "Give it a name, hit start, and Cluely begins transcribing whatever it can hear.",
  },
  {
    step: "02",
    icon: Keyboard,
    title: "Press Ctrl + Enter",
    body: "It reads the recent transcript plus your uploaded context and answers in a couple of seconds.",
  },
  {
    step: "03",
    icon: FileText,
    title: "End and walk away",
    body: "Summary, key points, action items, and a follow-up draft are waiting in your history.",
  },
];

const stats = [
  { icon: Languages, value: "12+", label: "languages transcribed" },
  { icon: Timer, value: "~300ms", label: "transcription latency" },
  { icon: Sparkles, value: "95%", label: "transcription accuracy" },
];

const plans = [
  {
    name: "Starter",
    price: "$0",
    cadence: "forever",
    blurb: "Enough to see whether it changes how a call goes.",
    features: [
      "20 live answers a month",
      "Session history and transcripts",
      "3 context files",
      "Meeting notes on demand",
    ],
    cta: "Start free",
    highlight: false,
  },
  {
    name: "Pro",
    price: "$20",
    cadence: "per month",
    blurb: "For anyone whose day is mostly conversations.",
    features: [
      "Unlimited live answers",
      "Unlimited context files",
      "Latest Claude models",
      "Follow-up email drafts",
      "Priority responses",
    ],
    cta: "Go Pro",
    highlight: true,
  },
  {
    name: "Team",
    price: "Talk to us",
    cadence: "",
    blurb: "Shared context and admin controls for a whole team.",
    features: [
      "Everything in Pro",
      "Shared context library",
      "SSO and SCIM",
      "Usage and retention controls",
    ],
    cta: "Contact sales",
    highlight: false,
  },
];

export default function Home() {
  return (
    <>
      <Nav />

      <main className="flex-1">
        {/* Hero */}
        <section className="aurora grain relative overflow-hidden border-b border-line/60">
          <div className="mx-auto max-w-6xl px-5 pb-20 pt-20 md:pb-28 md:pt-28">
            <div className="rise mx-auto max-w-3xl text-center">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-xs text-muted backdrop-blur">
                <span className="live-dot h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Listening in 12 languages, answering in about a second
              </div>

              <h1 className="text-balance text-5xl font-semibold leading-[1.05] tracking-tight md:text-7xl">
                Real-time AI for
                <br />
                every conversation
              </h1>

              <p className="mx-auto mt-6 max-w-xl text-pretty text-lg text-muted">
                Cluely listens to your meetings, hands you the answer the moment you need it, and
                writes the notes once everyone hangs up.
              </p>

              <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  href="/signup"
                  className="press inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3 font-medium text-background"
                >
                  Start free <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="#how"
                  className="press inline-flex items-center gap-2 rounded-full border border-line bg-surface/60 px-6 py-3 font-medium backdrop-blur hover:bg-surface-2"
                >
                  See how it works
                </a>
              </div>

              <p className="mt-4 text-xs text-muted">
                Free forever plan. No card. Runs in your browser.
              </p>
            </div>

            {/* Product peek */}
            <div className="rise mx-auto mt-16 max-w-4xl">
              <div className="card overflow-hidden shadow-2xl shadow-black/60">
                <div className="flex items-center gap-2 border-b border-line px-4 py-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#2a2a2e]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#2a2a2e]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#2a2a2e]" />
                  <span className="ml-2 flex items-center gap-2 text-xs text-muted">
                    <span className="live-dot h-1.5 w-1.5 rounded-full bg-red-500" />
                    Live — Series A partner call
                  </span>
                </div>

                <div className="grid gap-px bg-line/60 md:grid-cols-[1.1fr_1fr]">
                  <div className="space-y-3 bg-surface p-5 text-sm">
                    <p className="text-xs uppercase tracking-widest text-muted">Transcript</p>
                    <p className="text-muted">
                      <span className="text-foreground">Them:</span> …before we go further, how are
                      you thinking about gross margin at scale?
                    </p>
                    <p className="text-muted">
                      <span className="text-foreground">Me:</span> Good question, let me pull that
                      up.
                    </p>
                  </div>

                  <div className="bg-surface-2 p-5">
                    <p className="mb-3 flex items-center gap-2 text-xs uppercase tracking-widest text-muted">
                      <Sparkles className="h-3.5 w-3.5" /> Cluely
                    </p>
                    <p className="text-sm leading-relaxed">
                      Gross margin lands at <strong>78%</strong> once inference is amortized.
                    </p>
                    <ul className="mt-3 space-y-1.5 text-sm text-muted">
                      <li>• 71% today, up 9 points over two quarters</li>
                      <li>• Cost per session fell 40% after caching</li>
                      <li>• Support is the only line that scales with seats</li>
                    </ul>
                    <p className="mt-4 text-xs text-muted">
                      From <span className="text-foreground">Q3-metrics.md</span> · 0.9s
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="border-b border-line/60">
          <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
            <h2 className="max-w-2xl text-4xl font-semibold tracking-tight md:text-5xl">
              Three steps, then you forget it is running
            </h2>

            <div className="mt-14 grid gap-5 md:grid-cols-3">
              {steps.map((s) => (
                <div key={s.step} className="card p-6">
                  <div className="flex items-center justify-between">
                    <s.icon className="h-5 w-5" />
                    <span className="text-xs text-muted">{s.step}</span>
                  </div>
                  <h3 className="mt-5 text-lg font-medium">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 grid gap-5 sm:grid-cols-3">
              {stats.map((s) => (
                <div key={s.label} className="card flex items-center gap-4 p-6">
                  <s.icon className="h-5 w-5 text-muted" />
                  <div>
                    <p className="text-2xl font-semibold tracking-tight">{s.value}</p>
                    <p className="text-sm text-muted">{s.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="border-b border-line/60">
          <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
            <h2 className="max-w-2xl text-4xl font-semibold tracking-tight md:text-5xl">
              Built for the middle of a conversation
            </h2>
            <p className="mt-4 max-w-xl text-muted">
              Not a chatbot you go and visit. Something that is already caught up when you need it.
            </p>

            <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {features.map((f) => (
                <div key={f.title} className="card p-6">
                  <f.icon className="h-5 w-5" />
                  <h3 className="mt-5 text-lg font-medium">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="border-b border-line/60">
          <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
            <h2 className="text-4xl font-semibold tracking-tight md:text-5xl">Pricing</h2>
            <p className="mt-4 max-w-xl text-muted">
              Start free. Upgrade when you catch yourself opening it for every call.
            </p>

            <div className="mt-14 grid gap-5 lg:grid-cols-3">
              {plans.map((plan) => (
                <div
                  key={plan.name}
                  className={`card flex flex-col p-7 ${
                    plan.highlight ? "border-foreground/40 bg-surface-2" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium">{plan.name}</h3>
                    {plan.highlight && (
                      <span className="rounded-full bg-foreground px-2.5 py-0.5 text-xs font-medium text-background">
                        Popular
                      </span>
                    )}
                  </div>

                  <div className="mt-5 flex items-end gap-2">
                    <span className="text-4xl font-semibold tracking-tight">{plan.price}</span>
                    {plan.cadence && <span className="pb-1 text-sm text-muted">{plan.cadence}</span>}
                  </div>

                  <p className="mt-3 text-sm text-muted">{plan.blurb}</p>

                  <ul className="mt-6 flex-1 space-y-3 text-sm">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href="/signup"
                    className={`press mt-7 rounded-full px-5 py-3 text-center text-sm font-medium ${
                      plan.highlight
                        ? "bg-foreground text-background"
                        : "border border-line hover:bg-surface-2"
                    }`}
                  >
                    {plan.cta}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="aurora grain relative overflow-hidden">
          <div className="mx-auto max-w-3xl px-5 py-24 text-center md:py-32">
            <h2 className="text-balance text-4xl font-semibold tracking-tight md:text-6xl">
              Your next call starts in a few minutes
            </h2>
            <p className="mx-auto mt-5 max-w-lg text-muted">
              Setup takes about thirty seconds. Bring the notes you would have skimmed anyway.
            </p>
            <Link
              href="/signup"
              className="press mt-9 inline-flex items-center gap-2 rounded-full bg-foreground px-7 py-3.5 font-medium text-background"
            >
              Create your account <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-10 text-sm text-muted sm:flex-row">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            <span>Cluely</span>
          </div>
          <p>A study build. Use it where everyone in the room knows it is on.</p>
        </div>
      </footer>
    </>
  );
}
