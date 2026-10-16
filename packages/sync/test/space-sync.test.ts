import { newId } from "@buildpair/domain";
import { describe, expect, it } from "vitest";
import { MemoryStorage, SpaceSync } from "../src";
import { FakeRoom, FakeTransport, settle } from "./fake-server";

function device(room: FakeRoom, userId: string, storage = new MemoryStorage()) {
  const transport = new FakeTransport(room, userId);
  const sync = new SpaceSync("space-1", userId, storage, transport);
  return { sync, transport, storage };
}

const texts = (s: SpaceSync) => s.getSnapshot().view.messages.map((m) => m.body);

describe("SpaceSync", () => {
  it("shows a message at once, then confirms it and delivers it to the other member", async () => {
    const room = new FakeRoom(["maya", "jordan"]);
    const maya = device(room, "maya");
    const jordan = device(room, "jordan");
    await maya.sync.start();
    await jordan.sync.start();
    await settle();

    const r = maya.sync.dispatch({
      type: "message.send",
      payload: { messageId: newId(), body: "Flights booked!" },
    });
    expect(r.ok).toBe(true);
    expect(texts(maya.sync)).toEqual(["Flights booked!"]);
    expect(maya.sync.getSnapshot().pendingIds.size).toBe(1);

    await settle();
    expect(maya.sync.getSnapshot().pendingIds.size).toBe(0);
    expect(texts(jordan.sync)).toEqual(["Flights booked!"]);
    expect(maya.sync.getSnapshot().view.seq).toBe(room.state.seq);
  });

  it("queues changes while offline and sends them once, in order, after reconnecting", async () => {
    const room = new FakeRoom(["maya", "jordan"]);
    const maya = device(room, "maya");
    const jordan = device(room, "jordan");
    await maya.sync.start();
    await jordan.sync.start();
    await settle();

    maya.transport.goOffline();
    for (const body of ["one", "two", "three"]) {
      maya.sync.dispatch({ type: "message.send", payload: { messageId: newId(), body } });
    }
    await settle();
    expect(texts(jordan.sync)).toEqual([]);
    expect(texts(maya.sync)).toEqual(["one", "two", "three"]);

    maya.transport.goOnline();
    await settle();
    expect(texts(jordan.sync)).toEqual(["one", "two", "three"]);
    expect(room.state.messages).toHaveLength(3);
    expect(maya.sync.getSnapshot().pendingIds.size).toBe(0);
  });

  it("keeps unsent changes across an app restart", async () => {
    const room = new FakeRoom(["maya"]);
    const storage = new MemoryStorage();
    const first = device(room, "maya", storage);
    await first.sync.start();
    await settle();
    first.transport.goOffline();
    first.sync.dispatch({
      type: "message.send",
      payload: { messageId: newId(), body: "written on the subway" },
    });
    await first.sync.flush();
    first.sync.stop();

    const second = device(room, "maya", storage);
    await second.sync.start();
    expect(texts(second.sync)).toEqual(["written on the subway"]);
    await settle();
    expect(room.state.messages.map((m) => m.body)).toEqual(["written on the subway"]);
  });

  it("catches up after a dropped batch instead of showing a gap", async () => {
    const room = new FakeRoom(["maya", "jordan"]);
    const maya = device(room, "maya");
    const jordan = device(room, "jordan");
    await maya.sync.start();
    await jordan.sync.start();
    await settle();

    jordan.transport.socket!.dropNext = 1;
    maya.sync.dispatch({ type: "message.send", payload: { messageId: newId(), body: "first" } });
    await settle();
    expect(texts(jordan.sync)).toEqual([]);
    maya.sync.dispatch({ type: "message.send", payload: { messageId: newId(), body: "second" } });
    await settle();
    expect(texts(jordan.sync)).toEqual(["first", "second"]);
  });

  it("refuses changes the rules forbid before they reach the server", async () => {
    const room = new FakeRoom(["maya", "jordan"]);
    const maya = device(room, "maya");
    const jordan = device(room, "jordan");
    await maya.sync.start();
    await jordan.sync.start();
    await settle();

    const itemId = newId();
    maya.sync.dispatch({ type: "item.create", payload: { itemId, kind: "todo", title: "Dentist" } });
    await settle();
    const r = jordan.sync.dispatch({ type: "item.complete", payload: { itemId, on: "2026-10-10" } });
    expect(r).toEqual({ ok: false, reason: "Only the person who added this item can change it." });
  });

  it("rolls back a change the server rejects and shows the reason", async () => {
    const room = new FakeRoom(["maya"]);
    const maya = device(room, "maya");
    await maya.sync.start();
    await settle();
    const itemId = newId();
    maya.sync.dispatch({ type: "item.create", payload: { itemId, kind: "todo", title: "Dentist" } });
    await settle();
    // The server closes the item behind this device's back (say, from another device of Maya's).
    room.commit([
      {
        type: "item.wont",
        actorId: "maya",
        commandId: null,
        at: "2026-10-10T10:00:00.000Z",
        payload: { itemId },
      },
    ]);
    maya.transport.goOffline();
    maya.sync.dispatch({ type: "item.complete", payload: { itemId, on: "2026-10-10" } });
    expect(maya.sync.getSnapshot().view.items[itemId]?.status).toBe("done");
    maya.transport.goOnline();
    await settle();
    expect(maya.sync.getSnapshot().view.items[itemId]?.status).toBe("wont");
    expect(maya.sync.getSnapshot().pendingIds.size).toBe(0);
    expect(maya.sync.getSnapshot().error?.reason).toBe("This item is already closed.");
  });

  it("never shows another member's private items", async () => {
    const room = new FakeRoom(["maya", "jordan"]);
    const maya = device(room, "maya");
    const jordan = device(room, "jordan");
    await maya.sync.start();
    await jordan.sync.start();
    await settle();

    maya.sync.dispatch({
      type: "item.create",
      payload: { itemId: newId(), kind: "todo", title: "Renew passport", visibility: "owner" },
    });
    maya.sync.dispatch({
      type: "item.create",
      payload: { itemId: newId(), kind: "todo", title: "Pick up kids" },
    });
    await settle();
    const titles = (s: SpaceSync) =>
      Object.values(s.getSnapshot().view.items)
        .map((i) => i.title)
        .sort();
    expect(titles(maya.sync)).toEqual(["Pick up kids", "Renew passport"]);
    expect(titles(jordan.sync)).toEqual(["Pick up kids"]);
    expect(jordan.sync.getSnapshot().view.seq).toBe(room.state.seq);
  });

  it("drops an item from other devices, saved copy included, when its owner makes it private", async () => {
    const room = new FakeRoom(["maya", "jordan"]);
    const maya = device(room, "maya");
    const jordan = device(room, "jordan");
    await maya.sync.start();
    await jordan.sync.start();
    await settle();

    const itemId = newId();
    maya.sync.dispatch({ type: "item.create", payload: { itemId, kind: "todo", title: "Therapy" } });
    await settle();
    expect(jordan.sync.getSnapshot().view.items[itemId]).toBeDefined();

    maya.sync.dispatch({ type: "item.visibility", payload: { itemId, visibility: "owner" } });
    await settle();
    await jordan.sync.flush();
    expect(maya.sync.getSnapshot().view.items[itemId]?.visibility).toBe("owner");
    expect(jordan.sync.getSnapshot().view.items[itemId]).toBeUndefined();
    expect(JSON.stringify(await jordan.storage.load("space-1"))).not.toContain("Therapy");

    maya.sync.dispatch({ type: "item.visibility", payload: { itemId, visibility: "space" } });
    await settle();
    expect(jordan.sync.getSnapshot().view.items[itemId]).toMatchObject({ title: "Therapy" });
  });

  it("keeps a change the server is too busy for and sends it again later", async () => {
    const room = new FakeRoom(["maya", "jordan"]);
    const maya = device(room, "maya");
    await maya.sync.start();
    await settle();
    const before = SpaceSync.retryMs;
    SpaceSync.retryMs = 300;
    try {
      room.busyFor = 1;
      maya.sync.dispatch({ type: "message.send", payload: { messageId: newId(), body: "later" } });
      await settle();
      expect(maya.sync.getSnapshot().pendingIds.size).toBe(1);
      expect(maya.sync.getSnapshot().error?.reason).toContain("Wait");
      // A change made meanwhile waits too, so it can't overtake the first.
      maya.sync.dispatch({ type: "message.send", payload: { messageId: newId(), body: "after" } });
      await settle();
      expect(room.state.messages).toEqual([]);
      expect(texts(maya.sync)).toEqual(["later", "after"]);
      await new Promise((r) => setTimeout(r, 400));
      await settle();
      expect(maya.sync.getSnapshot().pendingIds.size).toBe(0);
      expect(room.state.messages.map((m) => m.body)).toEqual(["later", "after"]);
      // Once it lands, the notice goes.
      expect(maya.sync.getSnapshot().error).toBeNull();
    } finally {
      SpaceSync.retryMs = before;
    }
  });
});
