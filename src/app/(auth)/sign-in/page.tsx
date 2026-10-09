import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { safeNext } from "@/lib/api/misc";
import { quickSignInAction } from "../actions";
import { SignInForm } from "../_components/auth-forms";
import { QUICK_USERS, quickSignInEnabled } from "../quick-users";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

type SP = Promise<Record<string, string | string[] | undefined>>;

export default function SignInPage({ searchParams }: { searchParams: SP }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <SignInBody searchParams={searchParams} />
    </Suspense>
  );
}

async function SignInBody({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : null);
  const q = next === "/dashboard" ? "" : `?next=${encodeURIComponent(next)}`;
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Sign in to WeatherDesk</CardTitle>
          <CardDescription>Saved places, alerts, report subscriptions and organisations.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SignInForm next={next} />
          <div className="flex flex-col gap-1 text-center text-sm text-muted-foreground">
            <span>
              No account?{" "}
              <Link href={`/sign-up${q}`} className="font-medium text-foreground underline underline-offset-4">
                Create one
              </Link>
            </span>
            <span>
              Prefer your phone?{" "}
              <Link href={`/verify-phone${q}`} className="font-medium text-foreground underline underline-offset-4">
                Sign in with a one-time code
              </Link>
            </span>
          </div>
        </CardContent>
      </Card>
      {quickSignInEnabled() && <QuickSignInCard next={next} />}
    </>
  );
}

/** AUTH_MOCK (dev/e2e) only — instant sign-in as a seeded user. */
function QuickSignInCard({ next }: { next: string }) {
  return (
    <Card className="border-dashed" data-testid="quick-sign-in">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Quick sign-in as …</CardTitle>
          <Badge variant="outline">dev only</Badge>
        </div>
        <CardDescription>AUTH_MOCK is on. Seeded demo accounts — never available in production.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {QUICK_USERS.map((u) => (
          <form key={u.email} action={quickSignInAction}>
            <input type="hidden" name="email" value={u.email} />
            <input type="hidden" name="next" value={next} />
            <Button type="submit" variant="outline" className="w-full justify-between">
              <span>{u.label}</span>
              <span className="text-xs text-muted-foreground">{u.email}</span>
            </Button>
          </form>
        ))}
      </CardContent>
    </Card>
  );
}
