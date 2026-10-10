import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./db/schema";
import { sendEmail } from "./email";
import type { Env } from "./env";

export const TEST_OTP = "424242";

export function createAuth(env: Env) {
  const origins = env.APP_ORIGINS.split(",").map((o) => o.trim());
  const google =
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
      : undefined;
  const sharedCookieDomain = new URL(env.BETTER_AUTH_URL).hostname.endsWith("buildpair.app");

  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(drizzle(env.DB, { schema }), { provider: "sqlite", schema }),
    trustedOrigins: [...origins, "buildpair://"],
    socialProviders: google,
    advanced: sharedCookieDomain ? { crossSubDomainCookies: { enabled: true, domain: "buildpair.app" } } : {},
    plugins: [
      expo(),
      emailOTP({
        otpLength: 6,
        expiresIn: 600,
        allowedAttempts: 5,
        storeOTP: "hashed",
        // A fixed code only in automated tests; assertConfig forbids this provider in production.
        ...(env.EMAIL_PROVIDER === "test" ? { generateOTP: () => TEST_OTP } : {}),
        async sendVerificationOTP({ email, otp }) {
          await sendEmail(env, {
            to: email,
            subject: `${otp} is your Buildpair code`,
            text: `Your Buildpair sign-in code is ${otp}. It expires in 10 minutes.\n\nIf you didn't ask for it, you can ignore this email.`,
          });
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
