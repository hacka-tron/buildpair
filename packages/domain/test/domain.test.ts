import { Command, type CommandInput, type SpaceEvent } from "@buildpair/protocol";
import { describe, expect, it } from "vitest";
import {
  applyEvents,
  canSee,
  decide,
  emptySpace,
  newId,
  type SpaceState,
  sequence,
  viewFor,
  weekProgress,
} from "../src";

const AT = "2026-10-10T09:00:00.000Z";
const cmd = (c: Omit<CommandInput, "id" | "at">) => Command.parse({ id: newId(), at: AT, ...c });

function space(): SpaceState {
  const events: SpaceEvent[] = [
    {
      seq: 1,
      type: "space.created",
      actorId: "maya",
      commandId: null,
      at: AT,
      payload: { name: "Life", purpose: "Family" },
    },
    {
      seq: 2,
      type: "member.joined",
      actorId: "maya",
      commandId: null,
      at: AT,
      payload: { member: { userId: "maya", role: "owner", name: "Maya" } },
    },
    {
      seq: 3,
      type: "member.joined",
      actorId: "maya",
      commandId: null,
      at: AT,
      payload: { member: { userId: "jordan", role: "supporter", name: "Jordan" } },
    },
  ];
  return applyEvents(emptySpace(), events);
}

function run(state: SpaceState, c: Command, actor = "maya") {
  const d = decide(state, c, actor);
  if (!d.ok) throw new Error(d.reason);
  const events = sequence(d.events, state.seq);
  return { state: applyEvents(state, events), events };
}

describe("decide + apply", () => {
  it("creates and completes a to-do, posting a completion line to the chat", () => {
    const itemId = newId();
    let s = run(
      space(),
      cmd({ type: "item.create", payload: { itemId, kind: "todo", title: "Pay rent" } }),
    ).state;
    const r = run(s, cmd({ type: "item.complete", payload: { itemId, on: "2026-10-10" } }));
    s = r.state;
    expect(s.items[itemId]?.status).toBe("done");
    expect(r.events.map((e) => e.type)).toEqual(["item.completed", "message.posted"]);
    expect(s.messages.at(-1)).toMatchObject({ kind: "completion", body: "Pay rent", seq: r.events[1]!.seq });
  });

  it("counts habit check-offs per week and ignores a second check-off on the same day", () => {
    const itemId = newId();
    let s = run(
      space(),
      cmd({ type: "item.create", payload: { itemId, kind: "habit", title: "Gym", timesPerWeek: 4 } }),
    ).state;
    s = run(s, cmd({ type: "item.complete", payload: { itemId, on: "2026-10-05" } })).state;
    s = run(s, cmd({ type: "item.complete", payload: { itemId, on: "2026-10-07" } })).state;
    const again = decide(s, cmd({ type: "item.complete", payload: { itemId, on: "2026-10-07" } }), "maya");
    expect(again).toEqual({ ok: true, events: [] });
    expect(weekProgress(s.items[itemId]!, "2026-10-10")).toEqual({ done: 2, target: 4 });
    expect(weekProgress(s.items[itemId]!, "2026-10-12")).toEqual({ done: 0, target: 4 });
  });

  it("only lets the item's owner change it, and only members act at all", () => {
    const itemId = newId();
    const s = run(
      space(),
      cmd({ type: "item.create", payload: { itemId, kind: "todo", title: "Dentist" } }),
    ).state;
    expect(
      decide(s, cmd({ type: "item.complete", payload: { itemId, on: "2026-10-10" } }), "jordan"),
    ).toMatchObject({ ok: false });
    expect(
      decide(s, cmd({ type: "message.send", payload: { messageId: newId(), body: "hi" } }), "stranger"),
    ).toMatchObject({ ok: false });
  });

  it("keeps private items out of the chat and away from other members", () => {
    const itemId = newId();
    const r1 = run(
      space(),
      cmd({
        type: "item.create",
        payload: { itemId, kind: "todo", title: "Renew passport", visibility: "owner" },
      }),
    );
    const r2 = run(r1.state, cmd({ type: "item.complete", payload: { itemId, on: "2026-10-10" } }));
    expect(r2.events.map((e) => e.type)).toEqual(["item.completed"]);
    for (const e of [...r1.events, ...r2.events]) {
      expect(canSee(r2.state, "maya", e)).toBe(true);
      expect(canSee(r2.state, "jordan", e)).toBe(false);
    }
    expect(viewFor(r2.state, "jordan").items[itemId]).toBeUndefined();
  });

  it("toggles reactions on and off", () => {
    const messageId = newId();
    let s = run(
      space(),
      cmd({ type: "message.send", payload: { messageId, body: "Flights booked!" } }),
    ).state;
    s = run(s, cmd({ type: "reaction.toggle", payload: { messageId, emoji: "🎉" } }), "jordan").state;
    expect(s.reactions[messageId]).toEqual({ "🎉": ["jordan"] });
    s = run(s, cmd({ type: "reaction.toggle", payload: { messageId, emoji: "🎉" } }), "jordan").state;
    expect(s.reactions[messageId]).toEqual({});
  });

  it("treats a resent message as a no-op and ignores replayed events", () => {
    const messageId = newId();
    const c = cmd({ type: "message.send", payload: { messageId, body: "hello" } });
    const r = run(space(), c);
    expect(decide(r.state, c, "maya")).toEqual({ ok: true, events: [] });
    expect(applyEvents(r.state, r.events)).toBe(r.state);
  });
});
