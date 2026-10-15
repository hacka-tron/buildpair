import { newId } from "@buildpair/domain";
import { APIError } from "better-auth/api";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { type Context, Hono, type Next } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { createAuth, MIN_PASSWORD, NOT_INVITED, USE_PASSWORD } from "./auth";
import { invites, memberships, spaces } from "./db/schema";
import { assertConfig, type Env, isEmailAllowed, testLogin } from "./env";
import { USER_HEADER } from "./space-room";
import { signTicket, verifyTicket } from "./tickets";

type Vars = { userId: string; userName: string };
type App = { Bindings: Env; Variables: Vars };

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const err = (code: string, error: string) => ({ error, code });

export const app = new Hono<App>();

app.use("*", async (c, next) => {
  assertConfig(c.env);
  await next();
});

app.use(
  "*",
  cors({
    origin: (origin, c) =>
      c.env.APP_ORIGINS.split(",")
        .map((o: string) => o.trim())
        .includes(origin)
        ? origin
        : null,
    credentials: true,
    allowHeaders: ["content-type", "authorization"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    maxAge: 600,
  }),
);

app.get("/health", (c) => c.json({ ok: true, environment: c.env.ENVIRONMENT }));

const jsonBody = (c: { req: { raw: Request } }): Promise<Record<string, unknown> | null> =>
  c.req.raw
    .clone()
    .json()
    .then((b) => (b && typeof b === "object" ? (b as Record<string, unknown>) : null))
    .catch(() => null);

// Says plainly why no code is coming. Better Auth hides errors from sendVerificationOTP (so no one can probe
// which emails have accounts), and the checks in auth.ts are what actually stop the codes.
// Sign-up gets the same plain answer: Better Auth reports success for a refused account.
app.post("/api/auth/email-otp/send-verification-otp", (c, next) => explainRefusal(c, next));
app.post("/api/auth/sign-up/email", (c, next) => explainRefusal(c, next));

async function explainRefusal(c: Context<App>, next: Next) {
  const body = await jsonBody(c);
  if (body?.type === "sign-in") return c.json({ ...USE_PASSWORD, error: USE_PASSWORD.message }, 400);
  if (!c.env.ALLOWED_EMAILS?.trim()) return next();
  if (typeof body?.email === "string" && !isEmailAllowed(c.env, body.email))
    return c.json({ ...NOT_INVITED, error: NOT_INVITED.message }, 403);
  return next();
}

type AuthContext = Awaited<ReturnType<typeof createAuth>["$context"]>;

/**
 * Makes the shared test account if it's missing, and puts it back the way TEST_LOGIN says if anyone changed it
 * (a new password, or someone signing up with its email first). It's shared, so this keeps it usable.
 */
async function ensureTestAccount(ctx: AuthContext, login: { name: string; email: string; password: string }) {
  const found = await ctx.internalAdapter.findUserByEmail(login.email, { includeAccounts: true });
  const user =
    found?.user ??
    (await ctx.internalAdapter.createUser(
      { name: login.name, email: login.email, emailVerified: true },
      { method: "email-password" },
    ));
  if (!user.emailVerified) await ctx.internalAdapter.updateUser(user.id, { emailVerified: true });
  const credential = found?.accounts.find((a) => a.providerId === "credential");
  if (!credential) {
    await ctx.internalAdapter.linkAccount({
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password: await ctx.password.hash(login.password),
    });
  } else if (
    !credential.password ||
    !(await ctx.password.verify({ hash: credential.password, password: login.password }))
  ) {
    await ctx.internalAdapter.updatePassword(user.id, await ctx.password.hash(login.password));
  }
}

// Confirming an email takes the password too, and that password becomes the account's. Otherwise someone
// could sign up first with another person's email and their own password, wait for the real owner to
// confirm it, and keep a way in. Unconfirmed accounts can't sign in, so there are no other sessions to end.
app.post("/api/auth/email-otp/verify-email", async (c) => {
  const body = await jsonBody(c);
  const password = body?.password;
  if (typeof body?.email !== "string" || typeof password !== "string" || !password)
    return c.json(err("PASSWORD_REQUIRED", "Enter your password with the code."), 400);
  if (password.length < MIN_PASSWORD)
    return c.json(
      err("PASSWORD_TOO_SHORT", `Use at least ${MIN_PASSWORD} characters for your password.`),
      400,
    );
  const auth = createAuth(c.env);
  const res = await auth.handler(c.req.raw);
  if (!res.ok) return res;
  const ctx = await auth.$context;
  const found = await ctx.internalAdapter.findUserByEmail(body.email.trim().toLowerCase(), {
    includeAccounts: true,
  });
  if (found) {
    const hash = await ctx.password.hash(password);
    if (found.accounts.some((a) => a.providerId === "credential"))
      await ctx.internalAdapter.updatePassword(found.user.id, hash);
    else
      await ctx.internalAdapter.linkAccount({
        userId: found.user.id,
        providerId: "credential",
        accountId: found.user.id,
        password: hash,
      });
  }
  return res;
});

// The shared test account signs in by its bare name. It's made the first time someone signs in as it.
app.post("/api/auth/sign-in/email", async (c, next) => {
  const login = testLogin(c.env);
  const body = login && (await jsonBody(c));
  if (!login || !body || typeof body.email !== "string" || body.email.trim().toLowerCase() !== login.name)
    return next();
  const auth = createAuth(c.env);
  try {
    await ensureTestAccount(await auth.$context, login);
  } catch (e) {
    if (e instanceof APIError) return c.json({ ...e.body, error: e.body?.message }, e.statusCode as 403);
    throw e;
  }
  const headers = new Headers(c.req.raw.headers);
  headers.delete("content-length");
  return auth.handler(
    new Request(c.req.raw.url, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...body, email: login.email }),
    }),
  );
});

app.on(["GET", "POST"], "/api/auth/*", (c) => createAuth(c.env).handler(c.req.raw));

// WebSocket upgrades authenticate with a ticket (see tickets.ts), so they come before the session check.
app.get("/spaces/:id/ws", async (c) => {
  const spaceId = c.req.param("id");
  const userId = await verifyTicket(c.env.TICKET_SECRET, c.req.query("ticket") ?? "", `space:${spaceId}`);
  if (!userId)
    return c.json(err("bad_ticket", "This connection link expired. Reconnecting will fix it."), 401);
  const headers = new Headers(c.req.raw.headers);
  headers.set(USER_HEADER, userId);
  return room(c.env, spaceId).fetch(new Request(c.req.raw, { headers }));
});

app.get("/me/ws", async (c) => {
  const userId = await verifyTicket(c.env.TICKET_SECRET, c.req.query("ticket") ?? "", "inbox");
  if (!userId)
    return c.json(err("bad_ticket", "This connection link expired. Reconnecting will fix it."), 401);
  const headers = new Headers(c.req.raw.headers);
  headers.set(USER_HEADER, userId);
  return c.env.USER_HUB.get(c.env.USER_HUB.idFromName(userId)).fetch(new Request(c.req.raw, { headers }));
});

// Everything below needs a signed-in person.
app.use("*", async (c, next) => {
  const session = await createAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json(err("unauthenticated", "Please sign in."), 401);
  c.set("userId", session.user.id);
  c.set("userName", session.user.name || session.user.email.split("@")[0] || "Someone");
  await next();
});

const room = (env: Env, spaceId: string) => env.SPACE_ROOM.get(env.SPACE_ROOM.idFromName(spaceId));

async function isMember(env: Env, spaceId: string, userId: string) {
  const row = await drizzle(env.DB)
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.spaceId, spaceId), eq(memberships.userId, userId)))
    .get();
  return Boolean(row);
}

app.get("/me", (c) => c.json({ id: c.get("userId"), name: c.get("userName") }));

app.post("/me/ticket", async (c) =>
  c.json({ ticket: await signTicket(c.env.TICKET_SECRET, c.get("userId"), "inbox") }),
);

app.get("/spaces", async (c) => {
  const rows = await drizzle(c.env.DB)
    .select({ id: spaces.id, name: spaces.name, purpose: spaces.purpose, role: memberships.role })
    .from(memberships)
    .innerJoin(spaces, eq(spaces.id, memberships.spaceId))
    .where(eq(memberships.userId, c.get("userId")))
    .all();
  return c.json({ spaces: rows });
});

const CreateSpace = z.object({
  name: z.string().trim().min(1).max(60),
  purpose: z.string().trim().min(1, "Say what the space is for.").max(280),
});

app.post("/spaces", async (c) => {
  const body = CreateSpace.safeParse(await c.req.json().catch(() => null));
  if (!body.success)
    return c.json(err("invalid", body.error.issues[0]?.message ?? "Check the space details."), 400);
  const userId = c.get("userId");
  const id = newId();
  const now = new Date();
  const db = drizzle(c.env.DB);
  await db.batch([
    db
      .insert(spaces)
      .values({ id, name: body.data.name, purpose: body.data.purpose, ownerId: userId, createdAt: now }),
    db.insert(memberships).values({ spaceId: id, userId, role: "owner", joinedAt: now }),
  ]);
  await room(c.env, id).init({ spaceId: id, ...body.data, owner: { userId, name: c.get("userName") } });
  return c.json({ id, ...body.data, role: "owner" }, 201);
});

app.post("/spaces/:id/ticket", async (c) => {
  const spaceId = c.req.param("id");
  if (!(await isMember(c.env, spaceId, c.get("userId"))))
    return c.json(err("not_found", "Space not found."), 404);
  return c.json({ ticket: await signTicket(c.env.TICKET_SECRET, c.get("userId"), `space:${spaceId}`) });
});

app.get("/spaces/:id/events", async (c) => {
  const after = Number(c.req.query("after") ?? 0);
  if (!Number.isInteger(after) || after < 0)
    return c.json(err("invalid", "after must be a whole number."), 400);
  const batch = await room(c.env, c.req.param("id")).eventsAfter(after, c.get("userId"));
  if (!batch) return c.json(err("not_found", "Space not found."), 404);
  return c.json(batch);
});

/** HTTPS fallback for sending changes when no socket is open. Same rules and dedupe as the socket. */
app.post("/spaces/:id/commands", async (c) => {
  const body = z
    .object({ commands: z.array(z.unknown()).min(1).max(100) })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json(err("invalid", "Send up to 100 changes at a time."), 400);
  const stub = room(c.env, c.req.param("id"));
  const results = [];
  for (const cmd of body.data.commands) results.push(await stub.runCommand(cmd, c.get("userId")));
  return c.json({ results });
});

app.post("/spaces/:id/invites", async (c) => {
  const spaceId = c.req.param("id");
  if (!(await isMember(c.env, spaceId, c.get("userId"))))
    return c.json(err("not_found", "Space not found."), 404);
  const token = crypto.randomUUID().replace(/-/g, "");
  const now = Date.now();
  await drizzle(c.env.DB)
    .insert(invites)
    .values({
      token,
      spaceId,
      createdBy: c.get("userId"),
      createdAt: new Date(now),
      expiresAt: new Date(now + INVITE_TTL_MS),
    });
  return c.json({ token, url: `https://buildpair.app/join/${token}` }, 201);
});

app.post("/invites/:token/accept", async (c) => {
  const db = drizzle(c.env.DB);
  const invite = await db
    .select()
    .from(invites)
    .where(eq(invites.token, c.req.param("token")))
    .get();
  if (!invite || invite.expiresAt.getTime() < Date.now()) {
    return c.json(err("invite_expired", "This invite link has expired. Ask for a new one."), 410);
  }
  const userId = c.get("userId");
  await db
    .insert(memberships)
    .values({ spaceId: invite.spaceId, userId, role: "supporter", joinedAt: new Date() })
    .onConflictDoNothing();
  await room(c.env, invite.spaceId).addMember({ userId, role: "supporter", name: c.get("userName") });
  return c.json({ spaceId: invite.spaceId });
});

app.onError((e, c) => {
  console.error(e);
  return c.json(err("server_error", "Something failed on our side. Try again in a moment."), 500);
});
