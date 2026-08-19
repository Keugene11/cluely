"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export function LogoutButton() {
  const router = useRouter();

  return (
    <button
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/");
        router.refresh();
      }}
      className="press rounded-full border border-line p-2 text-muted hover:text-foreground"
      aria-label="Log out"
    >
      <LogOut className="h-4 w-4" />
    </button>
  );
}
