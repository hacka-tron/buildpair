import { Command, type CommandInput, type SpaceEvent } from "@buildpair/protocol";
import { describe, expect, it } from "vitest";
import {
  applyEvents,
  canSee,
  decide,
  emptySpace,
  newId,
  normalizeSpace,
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

describe("editing, finish days and skips", () => {
  const create = (s: SpaceState, payload: Record<string, unknown>) => {
    const itemId = newId();
    return {
      itemId,
      ...run(
        s,
        cmd({ type: "item.create", payload: { itemId, title: "Thing", kind: "todo", ...payload } } as never),
      ),
    };
  };

  it("records the day a to-do was finished", () => {
    const { itemId, state } = create(space(), { dueOn: "2026-10-01" });
    const done = run(state, cmd({ type: "item.complete", payload: { itemId, on: "2026-10-10" } })).state;
    expect(done.items[itemId]).toMatchObject({ status: "done", doneOn: ["2026-10-10"] });
  });

  it("skipping a habit twice in a day posts once", () => {
    const { itemId, state } = create(space(), { kind: "habit", timesPerWeek: 3 });
    const once = run(state, cmd({ type: "item.skip", payload: { itemId, on: "2026-10-10" } }));
    expect(once.state.items[itemId]?.skippedOn).toEqual(["2026-10-10"]);
    const twice = run(once.state, cmd({ type: "item.skip", payload: { itemId, on: "2026-10-10" } }));
    expect(twice.events).toEqual([]);
  });

  it("edits the title, day and time of a to-do", () => {
    const { itemId, state } = create(space(), { dueOn: "2026-10-12" });
    const edited = run(
      state,
      cmd({
        type: "item.edit",
        payload: { itemId, title: "Dentist", dueOn: "2026-10-16", dueTime: "15:00" },
      }),
    );
    expect(edited.state.items[itemId]).toMatchObject({
      title: "Dentist",
      dueOn: "2026-10-16",
      dueTime: "15:00",
    });
    // Clearing the day clears the time.
    const cleared = run(edited.state, cmd({ type: "item.edit", payload: { itemId, dueOn: null } }));
    expect(cleared.state.items[itemId]).toMatchObject({ dueOn: null, dueTime: null });
  });

  it("an edit that changes nothing produces no event", () => {
    const { itemId, state } = create(space(), { title: "Same" });
    expect(run(state, cmd({ type: "item.edit", payload: { itemId, title: "Same" } })).events).toEqual([]);
  });

  it("refuses edits that don't fit the item", () => {
    const { itemId: habit, state } = create(space(), { kind: "habit", timesPerWeek: 3 });
    expect(
      decide(state, cmd({ type: "item.edit", payload: { itemId: habit, dueOn: "2026-10-16" } }), "maya").ok,
    ).toBe(false);
    const { itemId: todo, state: s2 } = create(state, {});
    expect(
      decide(s2, cmd({ type: "item.edit", payload: { itemId: todo, timesPerWeek: 2 } }), "maya").ok,
    ).toBe(false);
    expect(
      decide(s2, cmd({ type: "item.edit", payload: { itemId: todo, dueTime: "09:00" } }), "maya").ok,
    ).toBe(false);
    expect(
      decide(s2, cmd({ type: "item.edit", payload: { itemId: todo, title: "Mine now" } }), "jordan").ok,
    ).toBe(false);
  });

  it("won't edit a finished item", () => {
    const { itemId, state } = create(space(), {});
    const done = run(state, cmd({ type: "item.complete", payload: { itemId, on: "2026-10-10" } })).state;
    expect(decide(done, cmd({ type: "item.edit", payload: { itemId, title: "New" } }), "maya").ok).toBe(
      false,
    );
  });

  it("changes a habit's times per week", () => {
    const { itemId, state } = create(space(), { kind: "habit", timesPerWeek: 3 });
    const edited = run(state, cmd({ type: "item.edit", payload: { itemId, timesPerWeek: 5 } }));
    expect(edited.state.items[itemId]?.timesPerWeek).toBe(5);
  });

  it("keeps edits to private items from other members", () => {
    const { itemId, state } = create(space(), { visibility: "owner" });
    const { events, state: after } = run(
      state,
      cmd({ type: "item.edit", payload: { itemId, title: "Secret" } }),
    );
    expect(canSee(after, "jordan", events[0]!)).toBe(false);
    expect(canSee(after, "maya", events[0]!)).toBe(true);
  });

  it("reads items saved before times and skips existed", () => {
    const old = { ...space(), seq: 3 };
    const legacy = {
      seq: 4,
      type: "item.created",
      actorId: "maya",
      commandId: null,
      at: AT,
      payload: {
        item: {
          id: newId(),
          kind: "todo",
          title: "Old",
          ownerId: "maya",
          parentId: null,
          visibility: "space",
          status: "open",
          dueOn: null,
          timesPerWeek: null,
          doneOn: [],
          createdAt: AT,
        },
      },
    } as unknown as SpaceEvent;
    const s = applyEvents(old, [legacy]);
    const item = Object.values(s.items)[0]!;
    expect(item.dueTime).toBeNull();
    expect(item.skippedOn).toEqual([]);
  });

  it("refuses a time without a day when creating", () => {
    expect(
      decide(
        space(),
        cmd({
          type: "item.create",
          payload: { itemId: newId(), kind: "todo", title: "x", dueTime: "09:00" },
        }),
        "maya",
      ).ok,
    ).toBe(false);
  });
});

describe("space details", () => {
  it("lets the owner rename and recolor, and ignores no-op edits", () => {
    const s = run(space(), cmd({ type: "space.edit", payload: { name: "Home", color: "teal" } })).state;
    expect(s).toMatchObject({ name: "Home", color: "teal" });
    expect(run(s, cmd({ type: "space.edit", payload: { name: "Home" } })).events).toEqual([]);
  });

  it("won't let a supporter change them", () => {
    expect(decide(space(), cmd({ type: "space.edit", payload: { name: "Mine" } }), "jordan").ok).toBe(false);
  });

  it("everyone in the space sees the change", () => {
    const { state, events } = run(space(), cmd({ type: "space.edit", payload: { purpose: "Us" } }));
    expect(canSee(state, "jordan", events[0]!)).toBe(true);
  });

  it("reads spaces saved before colors existed", () => {
    const { color: _, ...old } = space();
    expect(normalizeSpace(old as SpaceState).color).toBeNull();
  });
});
