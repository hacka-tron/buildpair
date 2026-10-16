import { newId } from "@buildpair/domain";
import { describe, expect, it } from "vitest";
import { type Client, join, PASSWORD, signIn } from "./helpers";

type Requests = { requests: { userId: string; name: string }[] };

async function setup() {
  const maya = await signIn(`maya-${newId()}@example.com`);
  const { id: spaceId } = (await (
    await maya.post("/spaces", { name: "Life", purpose: "Family" })
  ).json()) as {
    id: string;
  };
  const { token } = (await (await maya.post(`/spaces/${spaceId}/invites`)).json()) as { token: string };
  return { maya, spaceId, token };
}
const idOf = async (c: Client) => ((await (await c.get("/me")).json()) as { id: string }).id;
const requests = async (c: Client, spaceId: string) =>
  ((await (await c.get(`/spaces/${spaceId}/requests`)).json()) as Requests).requests;

describe("joining by request", () => {
  it("asks once, shows the owner who's waiting, and lets nothing through until approved", async () => {
    const { maya, spaceId, token } = await setup();
    const jordan = await signIn(`jordan-${newId()}@example.com`);
    const asked = await jordan.post(`/invites/${token}/accept`);
    expect(await asked.json()).toEqual({ spaceId, spaceName: "Life", status: "requested" });
    await jordan.post(`/invites/${token}/accept`);
    const jordanId = await idOf(jordan);
    expect((await requests(maya, spaceId)).map((r) => r.userId)).toEqual([jordanId]);
    const { spaces } = (await (await maya.get("/spaces")).json()) as { spaces: { requests?: number }[] };
    expect(spaces[0]?.requests).toBe(1);

    // Until then, Jordan can't read, write, connect, or see the space in his list.
    expect((await jordan.get(`/spaces/${spaceId}/events?after=0`)).status).toBe(404);
    expect((await jordan.post(`/spaces/${spaceId}/ticket`)).status).toBe(404);
    expect(((await (await jordan.get("/spaces")).json()) as { spaces: unknown[] }).spaces).toEqual([]);
    // And he can't approve himself.
    expect((await jordan.post(`/spaces/${spaceId}/requests/${jordanId}/approve`)).status).toBe(404);

    expect((await maya.post(`/spaces/${spaceId}/requests/${jordanId}/approve`)).status).toBe(200);
    expect((await jordan.get(`/spaces/${spaceId}/events?after=0`)).status).toBe(200);
    expect(await requests(maya, spaceId)).toEqual([]);
    const again = await jordan.post(`/invites/${token}/accept`);
    expect(await again.json()).toMatchObject({ status: "member" });
  });

  it("lets only the owner see and answer requests, and a decline lets nobody in", async () => {
    const { maya, spaceId, token } = await setup();
    const jordan = await signIn(`jordan-${newId()}@example.com`);
    await join(maya, jordan, spaceId);
    const sam = await signIn(`sam-${newId()}@example.com`);
    await sam.post(`/invites/${token}/accept`);
    const samId = await idOf(sam);
    expect((await jordan.get(`/spaces/${spaceId}/requests`)).status).toBe(404);
    expect((await jordan.post(`/spaces/${spaceId}/requests/${samId}/approve`)).status).toBe(404);
    expect((await maya.post(`/spaces/${spaceId}/requests/${samId}/decline`)).status).toBe(200);
    expect(await requests(maya, spaceId)).toEqual([]);
    expect((await sam.get(`/spaces/${spaceId}/events?after=0`)).status).toBe(404);
    // Approving after a decline does nothing: there's no request left.
    expect((await maya.post(`/spaces/${spaceId}/requests/${samId}/approve`)).status).toBe(200);
    expect((await sam.get(`/spaces/${spaceId}/events?after=0`)).status).toBe(404);
  });

  it("stops old links when the owner resets them", async () => {
    const { maya, spaceId, token } = await setup();
    const jordan = await signIn(`jordan-${newId()}@example.com`);
    expect((await jordan.post(`/spaces/${spaceId}/invites/reset`)).status).toBe(404);
    expect((await maya.post(`/spaces/${spaceId}/invites/reset`)).status).toBe(200);
    expect((await jordan.post(`/invites/${token}/accept`)).status).toBe(410);
    expect(await requests(maya, spaceId)).toEqual([]);
  });

  it("forgets a request when the person deletes their account", async () => {
    const { maya, spaceId, token } = await setup();
    const jordan = await signIn(`jordan-${newId()}@example.com`);
    await jordan.post(`/invites/${token}/accept`);
    expect((await jordan.post("/api/auth/delete-user", { password: PASSWORD })).status).toBe(200);
    expect(await requests(maya, spaceId)).toEqual([]);
  });

  it("undoes a join when the person starts deleting their account while it's approved", async () => {
    const { maya, spaceId, token } = await setup();
    const jordan = await signIn(`jordan-${newId()}@example.com`);
    await jordan.post(`/invites/${token}/accept`);
    const jordanId = await idOf(jordan);
    const { env } = await import("cloudflare:test");
    // A trigger marks the account as being deleted the moment the membership is written.
    await env.DB.prepare(
      "CREATE TRIGGER IF NOT EXISTS vanish AFTER INSERT ON memberships WHEN NEW.role = 'supporter' BEGIN INSERT OR IGNORE INTO account_erasures (user_id, started_at) VALUES (NEW.user_id, 0); END",
    ).run();
    try {
      expect((await maya.post(`/spaces/${spaceId}/requests/${jordanId}/approve`)).status).toBe(200);
    } finally {
      await env.DB.prepare("DROP TRIGGER IF EXISTS vanish").run();
    }
    expect((await jordan.get(`/spaces/${spaceId}/events?after=0`)).status).toBe(404);
    const { events } = (await (await maya.get(`/spaces/${spaceId}/events?after=0`)).json()) as {
      events: { type: string; actorId: string }[];
    };
    expect(events.some((e) => e.type === "member.joined" && e.actorId === jordanId)).toBe(false);
  });

  it("treats two approvals at once like one", async () => {
    const { maya, spaceId, token } = await setup();
    const jordan = await signIn(`jordan-${newId()}@example.com`);
    await jordan.post(`/invites/${token}/accept`);
    const jordanId = await idOf(jordan);
    const answers = await Promise.all(
      [1, 2].map(() => maya.post(`/spaces/${spaceId}/requests/${jordanId}/approve`)),
    );
    expect(answers.map((a) => a.status)).toEqual([200, 200]);
    expect((await jordan.get(`/spaces/${spaceId}/events?after=0`)).status).toBe(200);
  });
});
