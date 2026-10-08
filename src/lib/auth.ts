import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins/organization";
import { phoneNumber } from "better-auth/plugins/phone-number";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { getSmsAdapter } from "@/adapters";
import { env } from "@/lib/env";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Better Auth server instance: email+password, phone OTP (via the SMS
 * adapter — mock driver logs the code), organizations. The app-level `role`
 * lives on users: 'user' | 'editor' | 'admin'; authorization checks are in
 * src/lib/authz.ts.
 */
export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    usePlural: true,
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "user",
        input: false,
      },
    },
  },
  plugins: [
    phoneNumber({
      sendOTP: async ({ phoneNumber: to, code }) => {
        const rl = rateLimit(`otp:${to}`, RATE_LIMITS.otp.limit, RATE_LIMITS.otp.windowMs);
        if (!rl.ok) throw new Error("Too many OTP requests. Try again later.");
        await getSmsAdapter().send({
          to,
          channel: "sms",
          body: `Your WeatherDesk verification code is ${code}. It expires in 5 minutes.`,
        });
      },
    }),
    organization(),
    nextCookies(), // must be last
  ],
});

export type Session = typeof auth.$Infer.Session;
