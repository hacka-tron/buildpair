import { expoClient } from "@better-auth/expo/client";
import { emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { API_URL } from "./config";

const native = Platform.OS !== "web";

/** Sign-in client. Phones keep the session in secure storage; the web uses the browser's cookies. */
export const authClient = createAuthClient({
  baseURL: API_URL,
  plugins: [
    emailOTPClient(),
    ...(native
      ? [expoClient({ scheme: "buildpair", storagePrefix: "buildpair", storage: SecureStore })]
      : []),
  ],
});

/** Headers that carry the session on phones (the web sends cookies automatically). */
export async function authHeaders(): Promise<Record<string, string>> {
  if (!native) return {};
  const client = authClient as unknown as { getCookie(): Promise<string> };
  const cookie = await client.getCookie();
  return cookie ? { cookie } : {};
}
