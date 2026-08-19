"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Sparkles, X } from "lucide-react";
import { getDesktop } from "@/lib/desktop";

/** Compact sign-in for the desktop panel — the full page does not fit a 440px window. */
export function OverlayLogin() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const data = Object.fromEntries(new FormData(event.currentTarget));
    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong.");
      setPending(false);
      return;
    }

    router.refresh();
  }

  return (
    <div className="w-full px-3 pt-3 pb-3" style={{ WebkitAppRegion: "drag" } as React.CSSProperties}>
      <div className="cbar" style={{ WebkitAppRegion: "drag" } as React.CSSProperties}>
        <span className="flex items-center gap-2.5 pl-1 text-sm font-semibold tracking-tight">
          <span className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-gradient-to-br from-indigo-400/30 to-fuchsia-400/20 ring-1 ring-white/10">
            <Sparkles className="h-4 w-4" />
          </span>
          Otto
        </span>
        <button
          onClick={() => getDesktop()?.quit()}
          className="press flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-white/8 hover:text-foreground"
          aria-label="Quit"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <form
        onSubmit={onSubmit}
        className="cpanel mt-2 flex flex-col gap-2.5 p-4"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <p className="text-sm text-muted">
          {mode === "login" ? "Sign in to start a session." : "Create an account to get going."}
        </p>

        <input
          name="email"
          type="email"
          required
          placeholder="you@work.com"
          autoComplete="email"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm outline-none placeholder:text-muted focus:border-white/25"
        />
        <input
          name="password"
          type="password"
          required
          placeholder="Password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm outline-none placeholder:text-muted focus:border-white/25"
        />

        {error && <p className="text-xs text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="press flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-2.5 text-sm font-medium text-background disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              {mode === "login" ? "Log in" : "Create account"}
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          className="press text-center text-xs text-muted hover:text-foreground"
        >
          {mode === "login" ? "Need an account?" : "Already have one?"}
        </button>
      </form>
    </div>
  );
}
