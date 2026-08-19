"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignup = mode === "signup";

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
      setError(body.error ?? "Something went wrong. Try again.");
      setPending(false);
      return;
    }

    router.push("/app");
    router.refresh();
  }

  return (
    <main className="aurora grain relative flex flex-1 items-center justify-center px-5 py-16">
      <div className="w-full max-w-sm">
        <Link href="/" className="press mb-8 flex items-center justify-center gap-2 font-semibold">
          <Sparkles className="h-5 w-5" />
          Cluely
        </Link>

        <div className="card p-7">
          <h1 className="text-2xl font-semibold tracking-tight">
            {isSignup ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {isSignup
              ? "Free forever plan, no card needed."
              : "Pick up where your last session left off."}
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-3">
            {isSignup && (
              <input
                name="name"
                placeholder="Name"
                autoComplete="name"
                className="w-full rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm outline-none placeholder:text-muted focus:border-foreground/40"
              />
            )}
            <input
              name="email"
              type="email"
              required
              placeholder="you@work.com"
              autoComplete="email"
              className="w-full rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm outline-none placeholder:text-muted focus:border-foreground/40"
            />
            <input
              name="password"
              type="password"
              required
              placeholder={isSignup ? "Password (8+ characters)" : "Password"}
              autoComplete={isSignup ? "new-password" : "current-password"}
              className="w-full rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm outline-none placeholder:text-muted focus:border-foreground/40"
            />

            {error && <p className="text-sm text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={pending}
              className="press flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-3 text-sm font-medium text-background disabled:opacity-60"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  {isSignup ? "Create account" : "Log in"}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-sm text-muted">
          {isSignup ? "Already have an account? " : "New here? "}
          <Link
            href={isSignup ? "/login" : "/signup"}
            className="press text-foreground underline underline-offset-4"
          >
            {isSignup ? "Log in" : "Create one"}
          </Link>
        </p>
      </div>
    </main>
  );
}
