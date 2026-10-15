import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { emailOTP } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/d1";
import { eraseAccount } from "./account";
import * as schema from "./db/schema";
import { sendEmail } from "./email";
import { type Env, isEmailAllowed, testLogin } from "./env";

export const TEST_OTP = "424242";

export const MIN_PASSWORD = 8;

export const USE_PASSWORD = {
  code: "USE_PASSWORD",
  message: "Sign in with your email and password. Forgot it? Reset it from the sign-in screen.",
};

export const NOT_INVITED = {
  code: "NOT_INVITED",
  message:
    "This is a test version of Buildpair, open to invited people only. Ask the person who invited you to add your email.",
};

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
    // Profile fields people set themselves. app.ts checks their length and shape before Better Auth sees them.
    user: {
      additionalFields: {
        building: { type: "string", required: false, input: true },
        timeZone: { type: "string", required: false, input: true },
      },
      // Deleting your account takes your password (app.ts insists on it) and removes everything you made.
      deleteUser: {
        enabled: true,
        async beforeDelete(user) {
          await eraseAccount(env, user.id);
        },
      },
    },
    // Passwords, so signing in sends no email. Email goes out only to confirm a new account and to reset a password.
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: MIN_PASSWORD,
      revokeSessionsOnPasswordReset: true,
    },
    emailVerification: { autoSignInAfterVerification: true, sendOnSignIn: false },
    // On staging and previews only listed emails can make an account or sign in, by any method.
    databaseHooks: {
      user: {
        create: {
          async before(user) {
            if (!isEmailAllowed(env, user.email)) throw new APIError("FORBIDDEN", NOT_INVITED);
          },
        },
      },
      session: {
        create: {
          async before(session, ctx) {
            if (!env.ALLOWED_EMAILS?.trim()) return;
            const user = await ctx?.context.internalAdapter.findUserById(session.userId);
            if (!user || !isEmailAllowed(env, user.email)) throw new APIError("FORBIDDEN", NOT_INVITED);
          },
        },
      },
    },
    advanced: sharedCookieDomain ? { crossSubDomainCookies: { enabled: true, domain: "buildpair.app" } } : {},
    plugins: [
      expo(),
      emailOTP({
        otpLength: 6,
        expiresIn: 600,
        allowedAttempts: 5,
        storeOTP: "hashed",
        // Codes confirm the email at sign-up and reset passwords. They never sign in or make accounts.
        disableSignUp: true,
        overrideDefaultEmailVerification: true,
        // A fixed code only in automated tests; assertConfig forbids this provider in production.
        ...(env.EMAIL_PROVIDER === "test" ? { generateOTP: () => TEST_OTP } : {}),
        async sendVerificationOTP({ email, otp, type }, ctx) {
          if (type === "sign-in") throw new APIError("BAD_REQUEST", USE_PASSWORD);
          // A confirmation code also signs you in, so only accounts still waiting to be confirmed get one.
          if (type === "email-verification") {
            const adapter = ctx?.context.internalAdapter;
            const found = await adapter?.findUserByEmail(email);
            if (!found || found.user.emailVerified) {
              // Better Auth stored a code before asking us to send it. Drop it so nobody can guess it.
              await adapter?.deleteVerificationByIdentifier(`email-verification-otp-${email}`);
              return;
            }
          }
          // Every kind of code goes through here, so strangers can't use staging to send email.
          if (!isEmailAllowed(env, email)) throw new APIError("FORBIDDEN", NOT_INVITED);
          // The shared test account has no inbox.
          if (email === testLogin(env)?.email) return;
          const reset = type === "forget-password";
          await sendEmail(env, {
            to: email,
            subject: `${otp} is your Buildpair code`,
            text: reset
              ? `Use ${otp} to set a new Buildpair password. It expires in 10 minutes.\n\nIf you didn't ask for it, you can ignore this email. Your password hasn't changed.`
              : `Your Buildpair code is ${otp}. Enter it to finish making your account. It expires in 10 minutes.\n\nIf you didn't sign up, you can ignore this email.`,
          });
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
