import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { safeNext } from "@/lib/api/misc";
import { SignUpForm } from "../_components/auth-forms";

export const metadata: Metadata = { title: "Create account", robots: { index: false } };

type SP = Promise<Record<string, string | string[] | undefined>>;

export default function SignUpPage({ searchParams }: { searchParams: SP }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <SignUpBody searchParams={searchParams} />
    </Suspense>
  );
}

async function SignUpBody({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : null);
  const q = next === "/dashboard" ? "" : `?next=${encodeURIComponent(next)}`;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>Free. Save places, get advisories and weekly reports by email.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SignUpForm next={next} />
        <p className="text-center text-sm text-muted-foreground">
          Already registered?{" "}
          <Link href={`/sign-in${q}`} className="font-medium text-foreground underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
