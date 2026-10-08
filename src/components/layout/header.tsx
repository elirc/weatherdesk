import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/lib/authz";

/** Global header. Server component — reads the session for the account menu. */
export async function SiteHeader() {
  const user = await getSessionUser();
  return (
    <header className="border-b bg-background/95 sticky top-0 z-40 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span aria-hidden className="text-lg">⛅</span>
          WeatherDesk
        </Link>
        <nav className="hidden gap-4 text-sm text-muted-foreground sm:flex">
          <Link href="/alerts" className="hover:text-foreground">
            Alerts
          </Link>
          <Link href="/reports" className="hover:text-foreground">
            Reports
          </Link>
          <Link href="/accuracy" className="hover:text-foreground">
            Accuracy
          </Link>
          <Link href="/about" className="hover:text-foreground">
            About
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <>
              {(user.role === "editor" || user.role === "admin") && (
                <Button asChild variant="ghost" size="sm">
                  <Link href="/staff">Staff</Link>
                </Button>
              )}
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard">My places</Link>
              </Button>
            </>
          ) : (
            <Button asChild size="sm">
              <Link href="/sign-in">Sign in</Link>
            </Button>
          )}
        </div>
      </div>
      <p className="bg-amber-50 px-4 py-1 text-center text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
        Independent service — not affiliated with NiMet. Advisories are not official warnings.
      </p>
    </header>
  );
}
