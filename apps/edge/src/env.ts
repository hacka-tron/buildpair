import type { SpaceRoom } from "./space-room";
import type { UserHub } from "./user-hub";

export interface Env {
  DB: D1Database;
  SPACE_ROOM: DurableObjectNamespace<SpaceRoom>;
  USER_HUB: DurableObjectNamespace<UserHub>;
  /** Cloudflare Email Sending binding (Workers Paid). Only present where configured. */
  EMAIL?: { send(message: { to: string; from: string; subject: string; text: string }): Promise<unknown> };

  ENVIRONMENT: "development" | "test" | "preview" | "staging" | "production";
  /** Comma-separated origins allowed to call the API with credentials. */
  APP_ORIGINS: string;
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  /** Signs short-lived WebSocket tickets. */
  TICKET_SECRET: string;
  EMAIL_PROVIDER: "console" | "cloudflare" | "resend" | "test";
  EMAIL_FROM: string;
  RESEND_API_KEY?: string;
  /** Comma-separated emails allowed to sign in. Set on staging and previews so strangers can't use them; unset means anyone. */
  ALLOWED_EMAILS?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

/** Whether this email may sign in here: true everywhere ALLOWED_EMAILS isn't set. */
export function isEmailAllowed(env: Env, email: string): boolean {
  if (!env.ALLOWED_EMAILS?.trim()) return true;
  const allowed = env.ALLOWED_EMAILS.split(",").map((e) => e.trim().toLowerCase());
  return allowed.includes(email.trim().toLowerCase());
}

/** Fail fast with a clear message when configuration is missing or unsafe. */
export function assertConfig(env: Env): void {
  const missing = (
    ["BETTER_AUTH_URL", "BETTER_AUTH_SECRET", "TICKET_SECRET", "APP_ORIGINS", "EMAIL_FROM"] as const
  ).filter((k) => !env[k]);
  if (missing.length)
    throw new Error(`Missing configuration: ${missing.join(", ")}. See apps/edge/README.md.`);
  if (
    env.ENVIRONMENT === "production" &&
    (env.EMAIL_PROVIDER === "test" || env.EMAIL_PROVIDER === "console")
  ) {
    throw new Error("EMAIL_PROVIDER must be 'cloudflare' or 'resend' in production.");
  }
  if (env.EMAIL_PROVIDER === "resend" && !env.RESEND_API_KEY)
    throw new Error("RESEND_API_KEY is required for EMAIL_PROVIDER=resend.");
  if (env.EMAIL_PROVIDER === "cloudflare" && !env.EMAIL)
    throw new Error("EMAIL binding is required for EMAIL_PROVIDER=cloudflare.");
}
