import { newId } from "@buildpair/domain";
import { describe, expect, it } from "vitest";
import { type Client, command, join, signIn } from "./helpers";

const run = (who: Client, spaceId: string, ...cmds: ReturnType<typeof command>[]) =>
  who.post(`/spaces/${spaceId}/commands`, { commands: cmds });
const log = async (who: Client, spaceId: string) =>
  JSON.stringify(await (await who.get(`/spaces/${spaceId}/events?after=0`)).json());

describe("deleting an item", () => {
  it("leaves nothing of a private item in the log, even for people who join later", async () => {
    const maya = await signIn(`maya-${newId()}@example.com`);
    const jordan = await signIn(`jordan-${newId()}@example.com`);
    const { id: spaceId } = (await (await maya.post("/spaces", { name: "Life", purpose: "Me" })).json()) as {
      id: string;
    };
    await join(maya, jordan, spaceId);
    const itemId = newId();
    await run(
      maya,
      spaceId,
      command({ type: "item.create", payload: { itemId, kind: "todo", title: "See therapist" } }),
      command({ type: "item.complete", payload: { itemId, on: "2026-10-16" } }),
      command({ type: "item.visibility", payload: { itemId, visibility: "owner" } }),
    );
    expect(await log(maya, spaceId)).toContain("See therapist");
    const res = await run(maya, spaceId, command({ type: "item.delete", payload: { itemId } }));
    expect(((await res.json()) as { results: { ok: boolean }[] }).results[0]?.ok).toBe(true);
    expect(await log(maya, spaceId)).not.toContain("See therapist");
    expect(await log(jordan, spaceId)).not.toContain("See therapist");
    const sam = await signIn(`sam-${newId()}@example.com`);
    await join(maya, sam, spaceId);
    expect(await log(sam, spaceId)).not.toContain("See therapist");
    expect(await log(sam, spaceId)).not.toContain(itemId);
  });

  it("keeps a shared item's finished line in the chat, and a reopen takes it back", async () => {
    const maya = await signIn(`maya-${newId()}@example.com`);
    const { id: spaceId } = (await (await maya.post("/spaces", { name: "Life", purpose: "Me" })).json()) as {
      id: string;
    };
    const one = newId();
    const two = newId();
    await run(
      maya,
      spaceId,
      command({ type: "item.create", payload: { itemId: one, kind: "todo", title: "Ship it" } }),
      command({ type: "item.complete", payload: { itemId: one, on: "2026-10-16" } }),
      command({ type: "item.delete", payload: { itemId: one } }),
      command({ type: "item.create", payload: { itemId: two, kind: "todo", title: "Oops" } }),
      command({ type: "item.complete", payload: { itemId: two, on: "2026-10-16" } }),
      command({ type: "item.reopen", payload: { itemId: two, on: "2026-10-16" } }),
    );
    const { events } = JSON.parse(await log(maya, spaceId)) as { events: { type: string }[] };
    expect(events.filter((e) => e.type === "item.created")).toHaveLength(1);
    expect(events.map((e) => e.type)).toContain("item.reopened");
    expect(await log(maya, spaceId)).toContain("Ship it");
  });
});
