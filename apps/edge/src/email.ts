import type { Env } from "./env";

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
}

/** One place to send email, so the provider can change without touching callers. Never logs the body in production. */
export async function sendEmail(env: Env, email: OutgoingEmail): Promise<void> {
  switch (env.EMAIL_PROVIDER) {
    case "cloudflare":
      await env.EMAIL!.send({ ...email, from: env.EMAIL_FROM });
      return;
    case "resend": {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({
          from: env.EMAIL_FROM,
          to: email.to,
          subject: email.subject,
          text: email.text,
        }),
      });
      if (!res.ok) throw new Error(`Email provider returned ${res.status}`);
      return;
    }
    case "console":
      console.log(`[email] to=${email.to} subject=${email.subject}\n${email.text}`);
      return;
    case "test":
      return;
  }
}
