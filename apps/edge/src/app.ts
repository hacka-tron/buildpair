import { newId } from "@buildpair/domain";
import { Ulid } from "@buildpair/protocol";
import { APIError } from "better-auth/api";
import { and, count, eq, gt, inArray, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { type Context, Hono, type Next } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { createAuth, MIN_PASSWORD, NOT_INVITED, USE_PASSWORD } from "./auth";
import {
  accountErasures,
  blocks,
  invites,
  joinRequests,
  memberships,
  pastMemberships,
  reports,
  spaces,
  user,
} from "./db/schema";
import { sendEmail } from "./email";
import { assertConfig, type Env, isEmailAllowed, SLOW_DOWN, testLogin, withinLimit } from "./env";
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

// Our clients always send JSON to the auth routes, and the checks below read JSON. Anything else is
// refused, so a form-encoded body can't slip past them. OAuth callbacks (Apple posts a form) are exempt.
app.post("/api/auth/*", async (c, next) => {
  if (c.req.path.startsWith("/api/auth/callback/")) return next();
  const type = c.req.header("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json"))
    return c.json(err("UNSUPPORTED_BODY", "Send this as JSON."), 415);
  // Cloudflare always sets the caller's address; without it (tests, some local runs) there's nothing to key on.
  const ip = c.req.header("cf-connecting-ip");
  if (ip && !(await withinLimit(c.env.AUTH_LIMIT, `auth:${addressKey(ip)}`)))
    return c.json(err("TOO_MANY_REQUESTS", SLOW_DOWN), 429);
  return next();
});

/**
 * What a limit counts by: the whole IPv4 address, or the first 64 bits of an IPv6 one (one connection
 * usually gets a whole /64, so counting single addresses would hardly limit anything).
 */
export function addressKey(ip: string): string {
  if (!ip.includes(":")) return ip;
  const [head = "", tail = ""] = ip.toLowerCase().split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const full = ip.includes("::")
    ? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right]
    : left;
  return `${full
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ""))
    .join(":")}::/64`;
}

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
app.post(
  "/api/auth/sign-up/email",
  (c, next) => explainRefusal(c, next),
  (c, next) => checkProfile(c, next),
);

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

export const PROFILE_LIMITS = { name: 80, building: 140, image: 500 } as const;

/** A valid IANA time zone, or false. */
function isTimeZone(value: string): boolean {
  // Named zones only ("America/Chicago", "UTC"), not offsets like "+05:30".
  if (!value || value.length > 64 || !/^(?:UTC|[A-Z][A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+)$/.test(value))
    return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Profile fields arrive through Better Auth, which doesn't check their size; these routes do. */
async function checkProfile(c: Context<App>, next: Next) {
  const body = await jsonBody(c);
  const bad = (message: string) => c.json({ code: "INVALID_PROFILE", message, error: message }, 400);
  if (
    body &&
    "name" in body &&
    (typeof body.name !== "string" || body.name.trim().length > PROFILE_LIMITS.name)
  )
    return bad(`Keep your name under ${PROFILE_LIMITS.name} characters.`);
  if (body && "image" in body && body.image !== null) {
    if (typeof body.image !== "string" || body.image.length > PROFILE_LIMITS.image)
      return bad("That picture link is too long.");
  }
  if (body && "building" in body && body.building !== null) {
    if (typeof body.building !== "string" || body.building.length > PROFILE_LIMITS.building)
      return bad(`Keep "what you're building" under ${PROFILE_LIMITS.building} characters.`);
  }
  if (body && "timeZone" in body && body.timeZone !== null) {
    if (typeof body.timeZone !== "string" || !isTimeZone(body.timeZone))
      return bad("That time zone isn't one we know.");
  }
  return next();
}
app.post("/api/auth/update-user", (c, next) => checkProfile(c, next));

// Deleting an account always takes the password, so a phone left signed in can't be used to do it. Better Auth
// would also accept a recent session alone, or a token from an email we never send.
app.post("/api/auth/delete-user", async (c, next) => {
  const body = await jsonBody(c);
  if (typeof body?.password !== "string" || !body.password || "token" in body)
    return c.json(err("PASSWORD_REQUIRED", "Enter your password to delete your account."), 400);
  return next();
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
  // Tickets only open a connection (whose commands are counted in the room), so they don't count.
  const counts = c.req.method === "POST" && !c.req.path.endsWith("/ticket");
  if (counts && !(await withinLimit(c.env.WRITE_LIMIT, `write:${session.user.id}`)))
    return c.json(err("too_many_requests", SLOW_DOWN), 429);
  await next();
});

const room = (env: Env, spaceId: string) => env.SPACE_ROOM.get(env.SPACE_ROOM.idFromName(spaceId));

async function roleIn(env: Env, spaceId: string, userId: string) {
  const row = await drizzle(env.DB)
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.spaceId, spaceId), eq(memberships.userId, userId)))
    .get();
  return row?.role ?? null;
}

async function isMember(env: Env, spaceId: string, userId: string) {
  return (await roleIn(env, spaceId, userId)) !== null;
}

app.get("/me", (c) => c.json({ id: c.get("userId"), name: c.get("userName") }));

app.post("/me/ticket", async (c) =>
  c.json({ ticket: await signTicket(c.env.TICKET_SECRET, c.get("userId"), "inbox") }),
);

app.get("/spaces", async (c) => {
  const rows = await drizzle(c.env.DB)
    .select({
      id: spaces.id,
      name: spaces.name,
      purpose: spaces.purpose,
      color: spaces.color,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(spaces, eq(spaces.id, memberships.spaceId))
    .where(eq(memberships.userId, c.get("userId")))
    .all();
  // Owners see how many people are waiting to join.
  const waiting = await drizzle(c.env.DB)
    .select({ spaceId: joinRequests.spaceId, n: count() })
    .from(joinRequests)
    .innerJoin(spaces, eq(spaces.id, joinRequests.spaceId))
    .where(eq(spaces.ownerId, c.get("userId")))
    .groupBy(joinRequests.spaceId)
    .all();
  const counts = new Map(waiting.map((w) => [w.spaceId, w.n]));
  return c.json({
    spaces: rows.map((r) => (r.role === "owner" ? { ...r, requests: counts.get(r.id) ?? 0 } : r)),
  });
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
  // The request itself counted once; each further change counts too, as it would over the socket.
  for (const [i, cmd] of body.data.commands.entries()) {
    if (i > 0 && !(await withinLimit(c.env.WRITE_LIMIT, `write:${c.get("userId")}`)))
      results.push({ ok: false, reason: SLOW_DOWN });
    else results.push(await stub.runCommand(cmd, c.get("userId")));
  }
  return c.json({ results });
});

/**
 * Move an item (a goal with its steps) to another of your spaces. The space it's in takes it out and
 * delivers it; sending the same moveId again resumes a delivery that hasn't landed yet.
 */
app.post("/spaces/:id/items/:itemId/move", async (c) => {
  const body = z
    .object({ moveId: Ulid, toSpaceId: z.string().min(1).max(64) })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json(err("invalid", "Pick a space to move it to."), 400);
  const userId = c.get("userId");
  const from = c.req.param("id");
  const { moveId, toSpaceId } = body.data;
  if (toSpaceId === from) return c.json(err("invalid", "It's already in this space."), 400);
  if (!(await isMember(c.env, from, userId)) || !(await isMember(c.env, toSpaceId, userId)))
    return c.json(err("not_found", "Space not found."), 404);
  const result = await room(c.env, from).moveOut(moveId, c.req.param("itemId"), toSpaceId, userId);
  if (!result.ok) return c.json(err("rejected", result.reason), 409);
  return c.json({ ok: true, delivered: result.delivered });
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

/**
 * Opening an invite link asks to join. The space's owner approves each request; until then the person
 * sees nothing of the space. Asking again changes nothing, and members are sent straight in.
 */
app.post("/invites/:token/accept", async (c) => {
  const db = drizzle(c.env.DB);
  const invite = await db
    .select({ spaceId: invites.spaceId, expiresAt: invites.expiresAt, name: spaces.name })
    .from(invites)
    .innerJoin(spaces, eq(spaces.id, invites.spaceId))
    .where(eq(invites.token, c.req.param("token")))
    .get();
  const userId = c.get("userId");
  // Members go straight in, even with an old link.
  if (invite && (await isMember(c.env, invite.spaceId, userId)))
    return c.json({ spaceId: invite.spaceId, spaceName: invite.name, status: "member" });
  if (!invite || invite.expiresAt.getTime() < Date.now()) {
    return c.json(err("invite_expired", "This invite link has expired. Ask for a new one."), 410);
  }
  // Someone the owner blocked gets the same answer, but their request goes nowhere.
  const blocked = await db
    .select({ id: blocks.blockedId })
    .from(blocks)
    .innerJoin(spaces, eq(spaces.ownerId, blocks.blockerId))
    .where(and(eq(spaces.id, invite.spaceId), eq(blocks.blockedId, userId)))
    .get();
  if (!blocked)
    await db
      .insert(joinRequests)
      .values({ spaceId: invite.spaceId, userId, name: c.get("userName"), createdAt: new Date() })
      .onConflictDoNothing();
  return c.json({ spaceId: invite.spaceId, spaceName: invite.name, status: "requested" });
});

/** Owner only: who's asking to join. */
app.get("/spaces/:id/requests", async (c) => {
  const spaceId = c.req.param("id");
  if ((await roleIn(c.env, spaceId, c.get("userId"))) !== "owner")
    return c.json(err("not_found", "Space not found."), 404);
  const requests = await drizzle(c.env.DB)
    .select({ userId: joinRequests.userId, name: joinRequests.name, createdAt: joinRequests.createdAt })
    .from(joinRequests)
    .where(eq(joinRequests.spaceId, spaceId))
    .orderBy(joinRequests.createdAt)
    .all();
  return c.json({ requests });
});

/** Owner only: let someone in as a supporter, or turn them down. Answering twice changes nothing. */
app.post("/spaces/:id/requests/:userId/:answer{approve|decline}", async (c) => {
  const spaceId = c.req.param("id");
  if ((await roleIn(c.env, spaceId, c.get("userId"))) !== "owner")
    return c.json(err("not_found", "Space not found."), 404);
  const db = drizzle(c.env.DB);
  const who = and(eq(joinRequests.spaceId, spaceId), eq(joinRequests.userId, c.req.param("userId")));
  // Taking the request is the claim: of two answers at once, only the one that gets it acts.
  const [request] = await db.delete(joinRequests).where(who).returning();
  if (!request || c.req.param("answer") === "decline") return c.json({ ok: true });
  const userId = request.userId;
  try {
    await db
      .insert(memberships)
      .values({ spaceId, userId, role: "supporter", joinedAt: new Date() })
      .onConflictDoNothing();
  } catch {
    // Their account is already gone.
    return c.json({ ok: true });
  }
  await room(c.env, spaceId).addMember({ userId, role: "supporter", name: request.name });
  // If they started deleting their account meanwhile, that deletion may have missed this join. Undo it.
  const leaving = await db.select().from(accountErasures).where(eq(accountErasures.userId, userId)).get();
  const still = await db.select({ id: user.id }).from(user).where(eq(user.id, userId)).get();
  if (leaving || !still) {
    await room(c.env, spaceId).eraseMember(userId);
    await db.delete(memberships).where(and(eq(memberships.spaceId, spaceId), eq(memberships.userId, userId)));
  }
  return c.json({ ok: true });
});

/** Owner only: stop every invite link made so far. People who already asked stay in the list. */
app.post("/spaces/:id/invites/reset", async (c) => {
  const spaceId = c.req.param("id");
  if ((await roleIn(c.env, spaceId, c.get("userId"))) !== "owner")
    return c.json(err("not_found", "Space not found."), 404);
  await drizzle(c.env.DB).delete(invites).where(eq(invites.spaceId, spaceId));
  return c.json({ ok: true });
});

/** Leave a space (your own ID), or as its owner remove someone from it. */
app.post("/spaces/:id/members/:userId/remove", async (c) => {
  const spaceId = c.req.param("id");
  const target = c.req.param("userId");
  if (!(await isMember(c.env, spaceId, c.get("userId"))))
    return c.json(err("not_found", "Space not found."), 404);
  const db = drizzle(c.env.DB);
  // Recorded first, so deleting their account later still reaches this room.
  await db
    .insert(pastMemberships)
    .values({ spaceId, userId: target, leftAt: new Date() })
    .onConflictDoNothing();
  const result = await room(c.env, spaceId).removeMember(target, c.get("userId"));
  if (!result.ok) {
    await db
      .delete(pastMemberships)
      .where(and(eq(pastMemberships.spaceId, spaceId), eq(pastMemberships.userId, target)));
    return c.json(err("rejected", result.reason), 409);
  }
  await db
    .delete(memberships)
    .where(
      and(
        eq(memberships.spaceId, spaceId),
        eq(memberships.userId, target),
        eq(memberships.role, "supporter"),
      ),
    );
  return c.json({ ok: true });
});

app.get("/me/blocks", async (c) => {
  const rows = await drizzle(c.env.DB)
    .select({ userId: blocks.blockedId, name: user.name })
    .from(blocks)
    .innerJoin(user, eq(user.id, blocks.blockedId))
    .where(eq(blocks.blockerId, c.get("userId")))
    .all();
  return c.json({ blocks: rows });
});

/** Block someone you share a space with. Their messages and reactions are hidden from you. */
app.post("/me/blocks", async (c) => {
  const body = z
    .object({ userId: z.string().min(1).max(64) })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json(err("invalid", "Pick someone to block."), 400);
  const me = c.get("userId");
  if (body.data.userId === me) return c.json(err("invalid", "You can't block yourself."), 400);
  const db = drizzle(c.env.DB);
  const exists = await db.select({ id: user.id }).from(user).where(eq(user.id, body.data.userId)).get();
  if (!exists) return c.json(err("not_found", "That person isn't on Buildpair any more."), 404);
  await db
    .insert(blocks)
    .values({ blockerId: me, blockedId: body.data.userId, createdAt: new Date() })
    .onConflictDoNothing();
  // Any request they have waiting on your spaces goes too.
  const mine = db.select({ id: spaces.id }).from(spaces).where(eq(spaces.ownerId, me));
  await db
    .delete(joinRequests)
    .where(and(eq(joinRequests.userId, body.data.userId), inArray(joinRequests.spaceId, mine)));
  return c.json({ ok: true });
});

app.post("/me/blocks/:userId/remove", async (c) => {
  await drizzle(c.env.DB)
    .delete(blocks)
    .where(and(eq(blocks.blockerId, c.get("userId")), eq(blocks.blockedId, c.req.param("userId"))));
  return c.json({ ok: true });
});

const Report = z.object({
  spaceId: z.string().min(1).max(64),
  userId: z.string().min(1).max(64),
  messageId: Ulid.optional(),
  reason: z.enum(["spam", "harassment", "inappropriate", "other"]),
  note: z.string().trim().max(1000).optional(),
});

/** Report someone you share a space with, or one of their messages. Stored, and emailed for review. */
app.post("/reports", async (c) => {
  const body = Report.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json(err("invalid", "Say why you're reporting this."), 400);
  const me = c.get("userId");
  const { spaceId, userId, messageId, reason, note } = body.data;
  if (userId === me) return c.json(err("invalid", "You can't report yourself."), 400);
  if (!(await isMember(c.env, spaceId, me))) return c.json(err("not_found", "Space not found."), 404);
  if (!(await room(c.env, spaceId).knows(userId, me)))
    return c.json(err("not_found", "That person isn't in this space."), 404);
  const db = drizzle(c.env.DB);
  const today = await db
    .select({ n: count() })
    .from(reports)
    .where(and(eq(reports.reporterId, me), gt(reports.createdAt, new Date(Date.now() - 86_400_000))))
    .get();
  if ((today?.n ?? 0) >= 20)
    return c.json(
      err("too_many_requests", "You've sent a lot of reports today. We're on them; try again tomorrow."),
      429,
    );
  let reported: string | null = null;
  if (messageId) {
    const message = await room(c.env, spaceId).messageFor(messageId, me);
    if (!message || message.authorId !== userId)
      return c.json(err("not_found", "That message is gone, so it can't be reported."), 404);
    reported = message.body;
  }
  const exists = await db.select({ id: user.id }).from(user).where(eq(user.id, userId)).get();
  if (!exists) return c.json(err("not_found", "That person isn't on Buildpair any more."), 404);
  // The same report again is kept, but not emailed again.
  const repeat = await db
    .select({ id: reports.id })
    .from(reports)
    .where(
      and(
        eq(reports.reporterId, me),
        eq(reports.targetId, userId),
        messageId ? eq(reports.messageId, messageId) : isNull(reports.messageId),
      ),
    )
    .get();
  const id = newId();
  await db.insert(reports).values({
    id,
    reporterId: me,
    targetId: userId,
    spaceId,
    messageId: messageId ?? null,
    body: reported,
    reason,
    note: note || null,
    createdAt: new Date(),
  });
  if (c.env.MODERATION_EMAIL && !repeat) {
    const text = [
      `Report ${id}`,
      `Reason: ${reason}`,
      `Reported person: ${userId}`,
      `Reported by: ${me}`,
      `Space: ${spaceId}`,
      messageId ? `Message ${messageId}:\n${reported}` : "No message, the person as a whole.",
      note ? `Note from the reporter:\n${note}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    try {
      await sendEmail(c.env, { to: c.env.MODERATION_EMAIL, subject: `Buildpair report: ${reason}`, text });
    } catch {
      console.error("report email failed", { id });
    }
  }
  return c.json({ ok: true }, 201);
});

app.onError((e, c) => {
  console.error(e);
  return c.json(err("server_error", "Something failed on our side. Try again in a moment."), 500);
});
