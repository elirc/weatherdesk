import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { REFERENCE_PATTERN } from "@/lib/api/paystack";
import { adapterMode } from "@/lib/env";
import { formatKobo } from "@/lib/money";
import { getPlan, getSubscription } from "@/server/queries/billing";

export const metadata: Metadata = { title: "Test checkout", robots: { index: false } };

/**
 * Mock Paystack hosted checkout (payments adapter in mock mode only).
 * "Pay" simulates success by redirecting to /billing/callback, exactly
 * like Paystack's real redirect.
 */
type SP = Promise<Record<string, string | string[] | undefined>>;

export default function MockCheckoutPage({ searchParams }: { searchParams: SP }) {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <MockCheckout searchParams={searchParams} />
    </Suspense>
  );
}

async function MockCheckout({ searchParams }: { searchParams: SP }) {
  if (adapterMode("payments") !== "mock") notFound();
  const sp = await searchParams;
  const reference = typeof sp.reference === "string" ? sp.reference : "";
  if (!REFERENCE_PATTERN.test(reference)) notFound();
  const sub = await getSubscription(reference);
  if (!sub) notFound();
  const plan = await getPlan(sub.planId);
  const back = sub.organizationId ? `/org/${sub.organizationId}/billing` : "/dashboard/daily";
  const cb = `/billing/callback?reference=${encodeURIComponent(reference)}&trxref=${encodeURIComponent(reference)}`;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Paystack checkout</CardTitle>
          <Badge variant="outline">TEST MODE</Badge>
        </div>
        <CardDescription>
          Simulated hosted checkout — no money moves and no card details are collected. In production this step is
          Paystack&apos;s own page.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Plan</span>
          <span className="font-medium">{plan?.name ?? sub.planId}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Amount</span>
          <span className="font-medium">{plan ? `${formatKobo(plan.priceKoboMonthly)} / month` : "—"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Reference</span>
          <code className="text-xs">{reference}</code>
        </div>
        {sub.status !== "pending" && (
          <p className="text-amber-700">This checkout is already {sub.status}.</p>
        )}
      </CardContent>
      <CardFooter className="flex gap-2">
        <Button asChild>
          <a href={cb} data-testid="mock-pay">
            Pay (simulate success)
          </a>
        </Button>
        <Button asChild variant="outline">
          <Link href={back}>Cancel</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
