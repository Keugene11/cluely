import Link from "next/link";
import { Sparkles } from "lucide-react";
import { getUser } from "@/lib/auth";

export async function Nav() {
  const user = await getUser();

  return (
    <header className="sticky top-0 z-50 border-b border-line/60 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/" className="press flex items-center gap-2 font-semibold tracking-tight">
          <Sparkles className="h-5 w-5" />
          Otto
        </Link>

        <nav className="hidden items-center gap-7 text-sm text-muted md:flex">
          <Link href="/#how" className="press hover:text-foreground">How it works</Link>
          <Link href="/#features" className="press hover:text-foreground">Features</Link>
          <Link href="/#pricing" className="press hover:text-foreground">Pricing</Link>
          <Link href="/download" className="press hover:text-foreground">Download</Link>
        </nav>

        <div className="flex items-center gap-2">
          {user ? (
            <Link
              href="/app"
              className="press rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background"
            >
              Open app
            </Link>
          ) : (
            <>
              <Link href="/login" className="press rounded-full px-4 py-2 text-sm text-muted hover:text-foreground">
                Log in
              </Link>
              <Link
                href="/signup"
                className="press rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background"
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
