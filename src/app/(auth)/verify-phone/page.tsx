import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { safeNext } from "@/lib/api/misc";
import { getSessionUser } from "@/lib/authz";
import { adapterMode } from "@/lib/env";
import { PhoneOtpForm } from "./phone-otp-form";

export const metadata: Metadata = { title: "Phone verification", robots: { index: false } };

type SP = Promise<Record<string, string | string[] | undefined>>;

export default function VerifyPhonePage({ searchParams }: { searchParams: SP }) {
  return (
    <Suspense fallback={<Skeleton className="h-80 w-full" />}>
      <VerifyPhoneBody searchParams={searchParams} />
    </Suspense>
  );
}

async function VerifyPhoneBody({ searchParams }: { searchParams: SP }) {
  const [sp, user] = await Promise.all([searchParams, getSessionUser()]);
  const mode = user ? "verify" : "sign-in";
  const next = safeNext(typeof sp.next === "string" ? sp.next : null, user ? "/dashboard/daily" : "/dashboard");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{mode === "verify" ? "Verify your phone number" : "Sign in with your phone"}</CardTitle>
        <CardDescription>
          {mode === "verify"
            ? "A verified number is used for SMS / WhatsApp daily forecasts."
            : "For accounts that already have a verified number."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <PhoneOtpForm mode={mode} next={next} mockSms={adapterMode("sms") === "mock"} />
        {mode === "sign-in" && (
          <p className="text-center text-sm text-muted-foreground">
            <Link href="/sign-in" className="underline underline-offset-4">
              Back to email sign-in
            </Link>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
