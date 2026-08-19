import Link from "next/link";
import { redirect } from "next/navigation";
import { FileStack, History, Radio, Sparkles } from "lucide-react";
import { getUser } from "@/lib/auth";
import { LogoutButton } from "@/components/logout-button";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const user = await getUser();
  if (!user) redirect("/login");

  const links = [
    { href: "/app", label: "Sessions", icon: History },
    { href: "/app/live", label: "Go live", icon: Radio },
    { href: "/app/context", label: "Context", icon: FileStack },
  ];

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-40 border-b border-line/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
          <Link href="/app" className="press flex items-center gap-2 font-semibold tracking-tight">
            <Sparkles className="h-5 w-5" />
            Cluely
          </Link>

          <nav className="flex items-center gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="press flex items-center gap-2 rounded-full px-3 py-2 text-sm text-muted hover:bg-surface hover:text-foreground"
              >
                <link.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{link.label}</span>
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted md:inline">
              {user.name || user.email}
              <span className="ml-2 rounded-full border border-line px-2 py-0.5 text-xs capitalize">
                {user.plan}
              </span>
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>

      <div className="flex-1">{children}</div>
    </div>
  );
}
