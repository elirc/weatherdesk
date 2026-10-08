"use client";

import { createAuthClient } from "better-auth/react";
import { organizationClient, phoneNumberClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [organizationClient(), phoneNumberClient()],
});

export const { signIn, signUp, signOut, useSession } = authClient;
