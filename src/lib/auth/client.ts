"use client";
import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { Auth } from "./index";

export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<Auth>()],
});
