"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

/** Tab-style section nav shared by dashboard and org layouts. */
export function SectionNav({ links }: { links: { href: string; label: string }[] }) {
  const path = usePathname();
  // longest matching prefix wins so "/org/x" doesn't light up for "/org/x/areas"
  const active = links
    .filter((l) => path === l.href || path.startsWith(`${l.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav aria-label="Section" className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 text-sm">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={active === l.href ? "page" : undefined}
          className={
            active === l.href
              ? "rounded-md bg-background px-3 py-1.5 font-medium shadow-sm"
              : "rounded-md px-3 py-1.5 text-muted-foreground hover:text-foreground"
          }
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

export function SignOutButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await authClient.signOut();
          router.push("/");
          router.refresh();
        })
      }
    >
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
