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

describe("a member deleting their account", () => {
  const erased = (s: SpaceState, userId: string): SpaceEvent => ({
    seq: s.seq + 1,
    type: "member.erased",
    actorId: userId,
    commandId: null,
    at: AT,
    payload: { userId },
  });

  it("takes their items, messages and reactions with them and leaves everyone else's", () => {
    const jordansItem = newId();
    const jordansNote = newId();
    const mayasNote = newId();
    let s = space();
    s = run(
      s,
      cmd({
        type: "item.create",
        payload: { itemId: jordansItem, kind: "todo", title: "Run", visibility: "space" },
      }),
      "jordan",
    ).state;
    s = run(
      s,
      cmd({ type: "item.complete", payload: { itemId: jordansItem, on: "2026-10-10" } }),
      "jordan",
    ).state;
    s = run(
      s,
      cmd({ type: "message.send", payload: { messageId: jordansNote, body: "hi" } }),
      "jordan",
    ).state;
    s = run(s, cmd({ type: "message.send", payload: { messageId: mayasNote, body: "hey" } })).state;
    s = run(
      s,
      cmd({ type: "reaction.toggle", payload: { messageId: mayasNote, emoji: "🎉" } }),
      "jordan",
    ).state;
    s = run(s, cmd({ type: "reaction.toggle", payload: { messageId: mayasNote, emoji: "👍" } })).state;
    s = run(s, cmd({ type: "reaction.toggle", payload: { messageId: jordansNote, emoji: "👍" } })).state;

    const after = applyEvents(s, [erased(s, "jordan")]);
    expect(after.members.jordan).toBeUndefined();
    expect(after.members.maya).toBeDefined();
    expect(after.items[jordansItem]).toBeUndefined();
    expect(after.messages.map((m) => m.id)).toEqual([mayasNote]);
    expect(after.reactions).toEqual({ [mayasNote]: { "👍": ["maya"] } });
    expect(
      decide(after, cmd({ type: "message.send", payload: { messageId: newId(), body: "?" } }), "jordan").ok,
    ).toBe(false);
  });

  it("is sent to everyone in the space", () => {
    const s = space();
    const e = erased(s, "jordan");
    expect(canSee(applyEvents(s, [e]), "maya", e)).toBe(true);
  });
});

describe("making an item private or shared after creating it", () => {
  function withGoal() {
    const goalId = newId();
    const stepId = newId();
    let s = run(
      space(),
      cmd({ type: "item.create", payload: { itemId: goalId, kind: "goal", title: "Launch v1" } }),
    ).state;
    s = run(
      s,
      cmd({
        type: "item.create",
        payload: { itemId: stepId, kind: "todo", title: "Ship", parentId: goalId },
      }),
    ).state;
    s = run(s, cmd({ type: "item.complete", payload: { itemId: stepId, on: "2026-10-10" } })).state;
    const line = s.messages.at(-1)!;
    s = run(
      s,
      cmd({ type: "reaction.toggle", payload: { messageId: line.id, emoji: "🎉" } }),
      "jordan",
    ).state;
    return { s, goalId, stepId, line };
  }

  it("going private takes the goal's steps, chat lines and reactions off other members' view", () => {
    const { s, goalId, stepId, line } = withGoal();
    const r = run(s, cmd({ type: "item.visibility", payload: { itemId: goalId, visibility: "owner" } }));
    expect(r.events).toHaveLength(1);
    const e = r.events[0]!;
    expect(e.type === "item.visibility" && e.payload).toMatchObject({
      itemIds: [goalId, stepId],
      items: [],
      messages: [],
    });
    // The event names IDs only, so it goes to everyone and their devices drop the items.
    expect(canSee(r.state, "jordan", e)).toBe(true);
    const jordan = viewFor(applyEvents(s, r.events), "jordan");
    expect(jordan.items[goalId]).toBeUndefined();
    expect(jordan.items[stepId]).toBeUndefined();
    expect(jordan.messages.some((m) => m.id === line.id)).toBe(false);
    expect(jordan.reactions[line.id]).toBeUndefined();
    expect(viewFor(r.state, "maya").items[stepId]?.visibility).toBe("owner");
    // Jordan can't react to the hidden line any more.
    expect(
      decide(
        r.state,
        cmd({ type: "reaction.toggle", payload: { messageId: line.id, emoji: "👍" } }),
        "jordan",
      ),
    ).toMatchObject({ ok: false });
  });

  it("going shared again brings back the items, lines and reactions for a device that dropped them", () => {
    const { s, goalId, stepId, line } = withGoal();
    const hidden = run(s, cmd({ type: "item.visibility", payload: { itemId: goalId, visibility: "owner" } }));
    const jordanDevice = viewFor(hidden.state, "jordan");
    const shown = run(
      hidden.state,
      cmd({ type: "item.visibility", payload: { itemId: goalId, visibility: "space" } }),
    );
    const e = shown.events[0]!;
    expect(canSee(shown.state, "jordan", e)).toBe(true);
    const after = viewFor(applyEvents(jordanDevice, shown.events), "jordan");
    expect(after.items[goalId]).toMatchObject({ title: "Launch v1", visibility: "space" });
    expect(after.items[stepId]).toMatchObject({ status: "done", visibility: "space" });
    expect(after.messages.find((m) => m.id === line.id)).toMatchObject({ kind: "completion" });
    expect(after.reactions[line.id]).toEqual({ "🎉": ["jordan"] });
    // The same as a new device that reads the whole log now.
    expect(after.items).toEqual(viewFor(shown.state, "jordan").items);
    expect(after.messages).toEqual(viewFor(shown.state, "jordan").messages);
  });

  it("an item created private and shared later reaches the others whole", () => {
    const itemId = newId();
    let r = run(
      space(),
      cmd({
        type: "item.create",
        payload: { itemId, kind: "habit", title: "Run", timesPerWeek: 3, visibility: "owner" },
      }),
    );
    const created = r.events;
    r = run(r.state, cmd({ type: "item.complete", payload: { itemId, on: "2026-10-09" } }));
    const jordanDevice = viewFor(applyEvents(r.state, []), "jordan");
    expect(jordanDevice.items[itemId]).toBeUndefined();
    const shared = run(r.state, cmd({ type: "item.visibility", payload: { itemId, visibility: "space" } }));
    const after = applyEvents(jordanDevice, shared.events);
    expect(after.items[itemId]).toMatchObject({ doneOn: ["2026-10-09"], visibility: "space" });
    expect(canSee(shared.state, "jordan", created[0]!)).toBe(true);
  });

  it("while private, a shared-again event isn't sent to the others", () => {
    const { s, goalId } = withGoal();
    let r = run(s, cmd({ type: "item.visibility", payload: { itemId: goalId, visibility: "owner" } }));
    r = run(r.state, cmd({ type: "item.visibility", payload: { itemId: goalId, visibility: "space" } }));
    const sharedEvent = r.events[0]!;
    r = run(r.state, cmd({ type: "item.visibility", payload: { itemId: goalId, visibility: "owner" } }));
    // Read later (on a new device), the shared event would carry titles of an item that's private now.
    expect(canSee(r.state, "jordan", sharedEvent)).toBe(false);
    expect(canSee(r.state, "maya", sharedEvent)).toBe(true);
  });

  it("only the owner changes it, steps follow their goal, and no change means no event", () => {
    const { s, goalId, stepId } = withGoal();
    expect(
      decide(s, cmd({ type: "item.visibility", payload: { itemId: goalId, visibility: "owner" } }), "jordan"),
    ).toMatchObject({ ok: false });
    expect(
      decide(s, cmd({ type: "item.visibility", payload: { itemId: stepId, visibility: "owner" } }), "maya"),
    ).toMatchObject({ ok: false, reason: expect.stringContaining("goal") });
    expect(
      decide(s, cmd({ type: "item.visibility", payload: { itemId: goalId, visibility: "space" } }), "maya"),
    ).toEqual({ ok: true, events: [] });
  });

  it("a new step under a private goal is private too", () => {
    const goalId = newId();
    const stepId = newId();
    let s = run(
      space(),
      cmd({
        type: "item.create",
        payload: { itemId: goalId, kind: "goal", title: "Raise", visibility: "owner" },
      }),
    ).state;
    s = run(
      s,
      cmd({
        type: "item.create",
        payload: { itemId: stepId, kind: "todo", title: "Deck", parentId: goalId },
      }),
    ).state;
    expect(s.items[stepId]?.visibility).toBe("owner");
  });

  it("steps go one level deep, under your own goal", () => {
    const { s, goalId, stepId } = withGoal();
    const step = (parentId: string, kind: "todo" | "goal" = "todo") =>
      cmd({ type: "item.create", payload: { itemId: newId(), kind, title: "x", parentId } });
    expect(decide(s, step(goalId, "goal"), "maya")).toMatchObject({ ok: false });
    expect(decide(s, step(stepId), "maya")).toMatchObject({ ok: false });
    expect(decide(s, step(goalId), "jordan")).toMatchObject({ ok: false });
  });

  it("leaves someone else's step alone, from data saved before that was refused", () => {
    const { s, goalId } = withGoal();
    const theirs = newId();
    const created = applyEvents(
      s,
      sequence(
        [
          {
            type: "item.created",
            actorId: "jordan",
            commandId: null,
            at: AT,
            payload: {
              item: {
                id: theirs,
                kind: "todo",
                title: "Jordan's",
                ownerId: "jordan",
                parentId: goalId,
                visibility: "space",
                status: "open",
                dueOn: null,
                dueTime: null,
                timesPerWeek: null,
                doneOn: [],
                skippedOn: [],
                createdAt: AT,
              },
            },
          },
        ],
        s.seq,
      ),
    );
    const r = run(
      created,
      cmd({ type: "item.visibility", payload: { itemId: goalId, visibility: "owner" } }),
    );
    expect(r.state.items[theirs]?.visibility).toBe("space");
  });
});
