import { newId } from "@buildpair/domain";
import type { SpaceEvent } from "@buildpair/protocol";
import { describe, expect, it } from "vitest";
import { type Client, command, join, PASSWORD, signIn } from "./helpers";

type Batch = { events: SpaceEvent[] };
const idOf = async (c: Client) => ((await (await c.get("/me")).json()) as { id: string }).id;

async function setup() {
  const maya = await signIn(`maya-${newId()}@example.com`);
  const jordan = await signIn(`jordan-${newId()}@example.com`);
  const { id: spaceId } = (await (
    await maya.post("/spaces", { name: "Life", purpose: "Family" })
  ).json()) as {
    id: string;
  };
  await join(maya, jordan, spaceId);
  return { maya, jordan, spaceId, mayaId: await idOf(maya), jordanId: await idOf(jordan) };
}

describe("leaving and removing people", () => {
  it("lets the owner remove a supporter, who then can't get back in without a new request", async () => {
    const { maya, jordan, spaceId, jordanId } = await setup();
    await jordan.post(`/spaces/${spaceId}/commands`, {
      commands: [command({ type: "message.send", payload: { messageId: newId(), body: "hi all" } })],
    });
    expect((await maya.post(`/spaces/${spaceId}/members/${jordanId}/remove`)).status).toBe(200);
    expect((await jordan.get(`/spaces/${spaceId}/events?after=0`)).status).toBe(404);
    expect((await jordan.post(`/spaces/${spaceId}/ticket`)).status).toBe(404);
    const log = (await (await maya.get(`/spaces/${spaceId}/events?after=0`)).json()) as Batch;
    expect(log.events.some((e) => e.type === "member.removed")).toBe(true);
    expect(JSON.stringify(log)).toContain("hi all");
  });

  it("lets a supporter leave, but not remove others, and the owner can't leave", async () => {
    const { maya, jordan, spaceId, mayaId, jordanId } = await setup();
    expect((await jordan.post(`/spaces/${spaceId}/members/${mayaId}/remove`)).status).toBe(409);
    expect((await maya.post(`/spaces/${spaceId}/members/${mayaId}/remove`)).status).toBe(409);
    expect((await jordan.post(`/spaces/${spaceId}/members/${jordanId}/remove`)).status).toBe(200);
    const { spaces } = (await (await jordan.get("/spaces")).json()) as { spaces: unknown[] };
    expect(spaces).toEqual([]);
    const sam = await signIn(`sam-${newId()}@example.com`);
    expect((await sam.post(`/spaces/${spaceId}/members/${jordanId}/remove`)).status).toBe(404);
  });
});

describe("blocking", () => {
  it("lists blocks, drops the blocked person's join requests, and can be undone", async () => {
    const maya = await signIn(`maya-${newId()}@example.com`);
    const pest = await signIn(`pest-${newId()}@example.com`);
    const pestId = await idOf(pest);
    const { id: spaceId } = (await (
      await maya.post("/spaces", { name: "Life", purpose: "Family" })
    ).json()) as {
      id: string;
    };
    const { token } = (await (await maya.post(`/spaces/${spaceId}/invites`)).json()) as { token: string };
    await pest.post(`/invites/${token}/accept`);
    expect((await maya.post("/me/blocks", { userId: pestId })).status).toBe(200);
    // The waiting request went with the block, and asking again goes nowhere, without saying so.
    const waiting = async () =>
      ((await (await maya.get(`/spaces/${spaceId}/requests`)).json()) as { requests: unknown[] }).requests;
    expect(await waiting()).toEqual([]);
    expect(await (await pest.post(`/invites/${token}/accept`)).json()).toMatchObject({ status: "requested" });
    expect(await waiting()).toEqual([]);
    const { blocks } = (await (await maya.get("/me/blocks")).json()) as { blocks: { userId: string }[] };
    expect(blocks.map((b) => b.userId)).toEqual([pestId]);
    expect((await maya.post(`/me/blocks/${pestId}/remove`)).status).toBe(200);
    await pest.post(`/invites/${token}/accept`);
    expect(await waiting()).toHaveLength(1);
    expect((await maya.post("/me/blocks", { userId: await idOf(maya) })).status).toBe(400);
  });
});

describe("reporting", () => {
  it("stores a report of a message the reporter can see, by its author only", async () => {
    const { maya, jordan, spaceId, mayaId, jordanId } = await setup();
    const messageId = newId();
    await jordan.post(`/spaces/${spaceId}/commands`, {
      commands: [command({ type: "message.send", payload: { messageId, body: "something nasty" } })],
    });
    const ok = await maya.post("/reports", { spaceId, userId: jordanId, messageId, reason: "harassment" });
    expect(ok.status).toBe(201);
    // Wrong author, unknown message, yourself, or a space you're not in: refused.
    expect(
      (await jordan.post("/reports", { spaceId, userId: mayaId, messageId, reason: "spam" })).status,
    ).toBe(404);
    expect(
      (await maya.post("/reports", { spaceId, userId: jordanId, messageId: newId(), reason: "spam" })).status,
    ).toBe(404);
    expect((await maya.post("/reports", { spaceId, userId: mayaId, reason: "spam" })).status).toBe(400);
    const sam = await signIn(`sam-${newId()}@example.com`);
    expect((await sam.post("/reports", { spaceId, userId: jordanId, reason: "spam" })).status).toBe(404);
    expect((await maya.post("/reports", { spaceId, userId: jordanId, reason: "rude" })).status).toBe(400);
    // Reporting the person as a whole works too.
    expect(
      (await maya.post("/reports", { spaceId, userId: jordanId, reason: "other", note: "Keeps spamming" }))
        .status,
    ).toBe(201);
  });

  it("won't report a line about someone else's private item", async () => {
    const { maya, jordan, spaceId, jordanId } = await setup();
    const itemId = newId();
    await jordan.post(`/spaces/${spaceId}/commands`, {
      commands: [
        command({ type: "item.create", payload: { itemId, kind: "todo", title: "Secret" } }),
        command({ type: "item.complete", payload: { itemId, on: "2026-10-16" } }),
      ],
    });
    const log = (await (await jordan.get(`/spaces/${spaceId}/events?after=0`)).json()) as Batch;
    const line = log.events.find((e) => e.type === "message.posted");
    if (line?.type !== "message.posted") throw new Error("no line");
    await jordan.post(`/spaces/${spaceId}/commands`, {
      commands: [command({ type: "item.visibility", payload: { itemId, visibility: "owner" } })],
    });
    const res = await maya.post("/reports", {
      spaceId,
      userId: jordanId,
      messageId: line.payload.message.id,
      reason: "spam",
    });
    expect(res.status).toBe(404);
  });

  it("caps reports at 20 a day and only reports people in the space", async () => {
    const { maya, spaceId, jordanId } = await setup();
    const stranger = await signIn(`stranger-${newId()}@example.com`);
    expect(
      (await maya.post("/reports", { spaceId, userId: await idOf(stranger), reason: "spam" })).status,
    ).toBe(404);
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++)
      statuses.push((await maya.post("/reports", { spaceId, userId: jordanId, reason: "spam" })).status);
    expect(statuses.slice(0, 20).every((s) => s === 201)).toBe(true);
    expect(statuses[20]).toBe(429);
  });
});

describe("deleting an account after leaving", () => {
  it("still erases everything they left behind", async () => {
    const { maya, jordan, spaceId, jordanId } = await setup();
    await jordan.post(`/spaces/${spaceId}/commands`, {
      commands: [command({ type: "message.send", payload: { messageId: newId(), body: "Jordan was here" } })],
    });
    expect((await jordan.post(`/spaces/${spaceId}/members/${jordanId}/remove`)).status).toBe(200);
    expect((await jordan.post("/api/auth/delete-user", { password: PASSWORD })).status).toBe(200);
    const log = await (await maya.get(`/spaces/${spaceId}/events?after=0`)).text();
    expect(log).not.toContain("Jordan was here");
  });
});
