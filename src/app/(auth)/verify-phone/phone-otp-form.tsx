"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { toE164Ng } from "@/lib/api/misc";

const phoneSchema = z.object({
  phone: z.string().refine((v) => toE164Ng(v) !== null, "Enter a Nigerian mobile number, e.g. 0803 123 4567"),
});
const codeSchema = z.object({ code: z.string().regex(/^\d{4,8}$/, "Enter the code from the SMS") });

/**
 * Phone OTP flow via the Better Auth phoneNumber plugin.
 * mode "verify": signed-in user adds/verifies a number (updatePhoneNumber).
 * mode "sign-in": existing user with a verified number signs in by code.
 */
export function PhoneOtpForm({ mode, next, mockSms }: { mode: "verify" | "sign-in"; next: string; mockSms: boolean }) {
  const router = useRouter();
  const [phone, setPhone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const phoneForm = useForm<z.infer<typeof phoneSchema>>({ resolver: zodResolver(phoneSchema), defaultValues: { phone: "" } });
  const codeForm = useForm<z.infer<typeof codeSchema>>({ resolver: zodResolver(codeSchema), defaultValues: { code: "" } });

  if (!phone) {
    return (
      <Form {...phoneForm}>
        <form
          className="space-y-4"
          onSubmit={phoneForm.handleSubmit((v) =>
            start(async () => {
              setError(null);
              const e164 = toE164Ng(v.phone)!;
              const res = await authClient.phoneNumber.sendOtp({ phoneNumber: e164 });
              if (res.error) return setError(res.error.message ?? "Could not send the code.");
              setPhone(e164);
              setInfo(`Code sent to ${e164}.`);
            }),
          )}
        >
          <FormField
            control={phoneForm.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Mobile number</FormLabel>
                <FormControl>
                  <Input type="tel" inputMode="tel" autoComplete="tel" placeholder="0803 123 4567" {...field} />
                </FormControl>
                <FormDescription>We&apos;ll text you a one-time code. Standard SMS rates may apply.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Sending…" : "Send code"}
          </Button>
        </form>
      </Form>
    );
  }

  return (
    <Form {...codeForm}>
      <form
        className="space-y-4"
        onSubmit={codeForm.handleSubmit((v) =>
          start(async () => {
            setError(null);
            const res = await authClient.phoneNumber.verify({
              phoneNumber: phone,
              code: v.code,
              ...(mode === "verify" ? { updatePhoneNumber: true } : {}),
            });
            if (res.error) {
              return setError(
                mode === "sign-in"
                  ? "That code didn't work, or no account has this number verified. Sign in with email and verify your number from the dashboard first."
                  : (res.error.message ?? "Invalid code."),
              );
            }
            router.push(next);
            router.refresh();
          }),
        )}
      >
        {info && <p className="text-sm text-muted-foreground">{info}</p>}
        {mockSms && (
          <Alert>
            <AlertDescription>dev: check server logs — the mock SMS driver prints the code ([mock-sms]).</AlertDescription>
          </Alert>
        )}
        <FormField
          control={codeForm.control}
          name="code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Code</FormLabel>
              <FormControl>
                <Input inputMode="numeric" autoComplete="one-time-code" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => setPhone(null)} disabled={pending}>
            Change number
          </Button>
          <Button type="submit" className="flex-1" disabled={pending}>
            {pending ? "Checking…" : mode === "verify" ? "Verify number" : "Sign in"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
