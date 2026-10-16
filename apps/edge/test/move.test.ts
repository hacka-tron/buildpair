import { env, runInDurableObject } from "cloudflare:test";
import { newId } from "@buildpair/domain";
import { PROTOCOL_VERSION, type SpaceEvent } from "@buildpair/protocol";
import { describe, expect, it } from "vitest";
import { MOVE_MAX_TRIES, moveRetryDelay, type SpaceRoom } from "../src/space-room";
import { type Client, command, join, openSocket, signIn } from "./helpers";

type Batch = { after: number; upTo: number; events: SpaceEvent[] };

async function spaceOf(owner: Client, name: string) {
  const { id } = (await (await owner.post("/spaces", { name, purpose: "Testing" })).json()) as { id: string };
  return id;
}
const run = (who: Client, spaceId: string, ...cmds: ReturnType<typeof command>[]) =>
  who.post(`/spaces/${spaceId}/commands`, { commands: cmds });
const log = async (who: Client, spaceId: string) =>
  (await (await who.get(`/spaces/${spaceId}/events?after=0`)).json()) as Batch;
const move = (who: Client, from: string, itemId: string, toSpaceId: string, moveId = newId()) =>
  who.post(`/spaces/${from}/items/${itemId}/move`, { moveId, toSpaceId });

/** Maya has two spaces. Jordan is in the first, Sam in the second. */
async function setup() {
  const maya = await signIn(`maya-${newId()}@example.com`);
  const jordan = await signIn(`jordan-${newId()}@example.com`);
  const sam = await signIn(`sam-${newId()}@example.com`);
  const home = await spaceOf(maya, "Home");
  const work = await spaceOf(maya, "Work");
  await join(maya, jordan, home);
  await join(maya, sam, work);
  return { maya, jordan, sam, home, work };
}

describe("moving an item to another space", () => {
  it("moves a goal with its steps and history, keeping the chat lines behind", async () => {
    const { maya, jordan, sam, home, work } = await setup();
    const goalId = newId();
    const stepId = newId();
    await run(
      maya,
      home,
      command({ type: "item.create", payload: { itemId: goalId, kind: "goal", title: "Launch v1" } }),
      command({
        type: "item.create",
        payload: { itemId: stepId, kind: "todo", title: "Write docs", parentId: goalId },
      }),
      command({ type: "item.complete", payload: { itemId: stepId, on: "2026-10-16" } }),
    );
    const watcher = await openSocket(jordan, home);
    watcher.send({ t: "hello", v: PROTOCOL_VERSION, afterSeq: 0 });
    await watcher.waitFor((m) => m.t === "events");

    const moveId = newId();
    expect((await move(maya, home, goalId, work, moveId)).status).toBe(200);
    await watcher.waitFor((m) => m.t === "events" && m.events.some((e) => e.type === "item.moved"));

    const there = await log(sam, work);
    const arrived = there.events.find((e) => e.type === "item.arrived");
    expect(arrived?.type === "item.arrived" && arrived.payload.items).toEqual([
      expect.objectContaining({ id: goalId, title: "Launch v1" }),
      expect.objectContaining({ id: stepId, status: "done", doneOn: ["2026-10-16"] }),
    ]);
    const here = await log(jordan, home);
    expect(here.events.some((e) => e.type === "item.created")).toBe(false);
    expect(
      here.events.some((e) => e.type === "message.posted" && e.payload.message.kind === "completion"),
    ).toBe(true);

    // Sending it again finishes nothing new and doesn't duplicate it.
    expect((await move(maya, home, goalId, work, moveId)).status).toBe(200);
    expect((await log(sam, work)).events.filter((e) => e.type === "item.arrived")).toHaveLength(1);
    // It can move back.
    expect((await move(maya, work, goalId, home)).status).toBe(200);
    const goalThere = (await log(sam, work)).events.some(
      (e) => e.type === "item.arrived" && e.payload.items.some((i) => i.id === goalId),
    );
    expect(goalThere).toBe(false);
    expect((await log(jordan, home)).events.filter((e) => e.type === "item.arrived")).toHaveLength(1);
    watcher.ws.close();
  });

  it("never shows a private item to anyone else, in either space", async () => {
    const { maya, jordan, sam, home, work } = await setup();
    const itemId = newId();
    await run(
      maya,
      home,
      command({ type: "item.create", payload: { itemId, kind: "todo", title: "See therapist" } }),
      command({ type: "item.complete", payload: { itemId, on: "2026-10-15" } }),
      command({ type: "item.visibility", payload: { itemId, visibility: "owner" } }),
    );
    const watcher = await openSocket(jordan, home);
    watcher.send({ t: "hello", v: PROTOCOL_VERSION, afterSeq: 0 });
    await watcher.waitFor((m) => m.t === "events");
    expect((await move(maya, home, itemId, work)).status).toBe(200);

    // The completion line from when it was shared goes too, and so does the item's history.
    const here = JSON.stringify(await log(jordan, home));
    expect(here).not.toContain("See therapist");
    expect(here).not.toContain("item.moved");
    expect(JSON.stringify(await log(sam, work))).not.toContain("See therapist");
    expect(JSON.stringify(await log(maya, work))).toContain("See therapist");
    expect(JSON.stringify(watcher.received)).not.toContain("item.moved");
    watcher.ws.close();
  });

  it("refuses moves that don't fit", async () => {
    const { maya, jordan, home, work } = await setup();
    const goalId = newId();
    const stepId = newId();
    await run(
      maya,
      home,
      command({ type: "item.create", payload: { itemId: goalId, kind: "goal", title: "Launch" } }),
      command({
        type: "item.create",
        payload: { itemId: stepId, kind: "todo", title: "Docs", parentId: goalId },
      }),
    );
    const elsewhere = await spaceOf(jordan, "Jordan's");
    expect((await move(jordan, home, goalId, elsewhere)).status).toBe(409);
    expect((await move(maya, home, stepId, work)).status).toBe(409);
    expect((await move(maya, home, goalId, elsewhere)).status).toBe(404);
    expect((await move(maya, home, goalId, home)).status).toBe(400);
    expect((await maya.post(`/spaces/${home}/items/${goalId}/move`, { toSpaceId: work })).status).toBe(400);
    expect((await log(maya, home)).events.filter((e) => e.type === "item.created")).toHaveLength(2);
  });

  it("never loses an item to a reused move ID", async () => {
    const { maya, sam, home, work } = await setup();
    const one = newId();
    const two = newId();
    await run(
      maya,
      home,
      command({ type: "item.create", payload: { itemId: one, kind: "todo", title: "First" } }),
      command({ type: "item.create", payload: { itemId: two, kind: "todo", title: "Second" } }),
    );
    const moveId = newId();
    expect((await move(maya, home, one, work, moveId)).status).toBe(200);
    // The same ID for another item is refused, and that item stays put.
    expect((await move(maya, home, two, work, moveId)).status).toBe(409);
    const titles = (b: Batch) =>
      b.events.flatMap((e) =>
        e.type === "item.created"
          ? [e.payload.item.title]
          : e.type === "item.arrived"
            ? e.payload.items.map((i) => i.title)
            : [],
      );
    expect(titles(await log(maya, home))).toEqual(["Second"]);
    // An ID that already brought something else into the other space: refused there, so it comes back.
    const third = await spaceOf(maya, "Third");
    const other = newId();
    await run(
      maya,
      third,
      command({ type: "item.create", payload: { itemId: other, kind: "todo", title: "Other" } }),
    );
    const taken = newId();
    expect((await move(maya, third, other, work, taken)).status).toBe(200);
    expect((await move(maya, home, two, work, taken)).status).toBe(409);
    expect(titles(await log(maya, home))).toEqual(["Second"]);
    expect(titles(await log(sam, work))).toEqual(["First", "Other"]);
  });

  it("answers a resent move the same way and doesn't move it twice", async () => {
    const { maya, sam, home, work } = await setup();
    const itemId = newId();
    await run(maya, home, command({ type: "item.create", payload: { itemId, kind: "todo", title: "Once" } }));
    const moveId = newId();
    expect((await move(maya, home, itemId, work, moveId)).status).toBe(200);
    const again = await move(maya, home, itemId, work, moveId);
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ ok: true, delivered: true });
    expect((await log(sam, work)).events.filter((e) => e.type === "item.arrived")).toHaveLength(1);
  });

  it("brings the item back when the other space refuses it", async () => {
    const { maya, home, work } = await setup();
    const itemId = newId();
    await run(
      maya,
      home,
      command({ type: "item.create", payload: { itemId, kind: "todo", title: "Boomerang" } }),
    );
    // The other space already used this move ID for something else.
    const third = await spaceOf(maya, "Third");
    const other = newId();
    await run(
      maya,
      third,
      command({ type: "item.create", payload: { itemId: other, kind: "todo", title: "Other" } }),
    );
    const moveId = newId();
    expect((await move(maya, third, other, work, moveId)).status).toBe(200);
    const refused = await move(maya, home, itemId, work, moveId);
    // It says so, and the item is already back.
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({
      error: "The other space didn't take it, so it's back here.",
    });
    const back = (await log(maya, home)).events.filter((e) => e.type === "item.arrived");
    expect(back).toHaveLength(1);
    expect(JSON.stringify(await log(maya, work))).not.toContain("Boomerang");
    // A fresh try with a new ID goes through.
    expect((await move(maya, home, itemId, work)).status).toBe(200);
    expect(JSON.stringify(await log(maya, work))).toContain("Boomerang");
  });

  it("tries an unreachable space more slowly each time, then brings the item back", async () => {
    const { maya, home, work } = await setup();
    const itemId = newId();
    await run(maya, home, command({ type: "item.create", payload: { itemId, kind: "todo", title: "Far" } }));
    const mayaId = ((await (await maya.get("/me")).json()) as { id: string }).id;
    const stub = env.SPACE_ROOM.get(env.SPACE_ROOM.idFromName(home));
    const tries = await runInDurableObject(stub, async (room: SpaceRoom, state) => {
      // Every other space is out of reach.
      const unreachable = {
        idFromName: () => ({}),
        get: () => ({
          receiveItems: () => Promise.reject(new Error("unreachable")),
        }),
      };
      Object.defineProperty(room, "env", { value: { ...env, SPACE_ROOM: unreachable } });
      const sql = state.storage.sql;
      const triesNow = () => sql.exec<{ tries: number }>("SELECT tries FROM outbox").toArray()[0]?.tries;
      const seen: (number | undefined)[] = [];
      expect(await room.moveOut(newId(), itemId, work, mayaId)).toEqual({ ok: true, delivered: false });
      seen.push(triesNow());
      const before = Date.now();
      await room.alarm();
      seen.push(triesNow());
      const wait = (await state.storage.getAlarm())! - before;
      expect(wait).toBeGreaterThanOrEqual(55_000);
      expect(wait).toBeLessThanOrEqual(65_000);
      sql.exec("UPDATE outbox SET tries = ?", MOVE_MAX_TRIES - 1);
      await room.alarm();
      seen.push(triesNow());
      return seen;
    });
    expect(tries).toEqual([0, 1, undefined]);
    const titles = (await log(maya, home)).events.flatMap((e) =>
      e.type === "item.arrived" ? e.payload.items.map((i) => i.title) : [],
    );
    expect(titles).toEqual(["Far"]);
    expect(JSON.stringify(await log(maya, work))).not.toContain("Far");
  });

  it("waits 30 seconds, then doubles, up to an hour", () => {
    expect([1, 2, 3, 7, 8, 30].map(moveRetryDelay)).toEqual([
      30_000, 60_000, 120_000, 1_920_000, 3_600_000, 3_600_000,
    ]);
  });
});
