import { Command, type CommandInput, type SpaceEvent } from "@buildpair/protocol";
import { describe, expect, it } from "vitest";
import {
  applyEvents,
  canSee,
  decide,
  decideArrive,
  decideMoveOut,
  decideRemove,
  emptySpace,
  forgetPlan,
  leavesWith,
  newId,
  nextRepeat,
  normalizeSpace,
  readReflection,
  reflectionDue,
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
                notes: "",
                repeat: null,
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

describe("moving an item to another space", () => {
  const base = { commandId: newId(), at: AT };
  function goal(visibility: "space" | "owner" = "space") {
    const goalId = newId();
    const stepId = newId();
    let s = run(
      space(),
      cmd({ type: "item.create", payload: { itemId: goalId, kind: "goal", title: "Launch", visibility } }),
    ).state;
    s = run(
      s,
      cmd({
        type: "item.create",
        payload: { itemId: stepId, kind: "todo", title: "Ship", parentId: goalId },
      }),
    ).state;
    s = run(s, cmd({ type: "item.complete", payload: { itemId: stepId, on: "2026-10-10" } })).state;
    return { s, goalId, stepId };
  }

  it("takes a goal with its steps and their history, and drops them here", () => {
    const { s, goalId, stepId } = goal();
    const out = decideMoveOut(s, goalId, "maya", base);
    if (!out.ok) throw new Error(out.reason);
    expect(out.items.map((i) => i.id)).toEqual([goalId, stepId]);
    const after = applyEvents(s, sequence([out.event], s.seq));
    expect(after.items[goalId]).toBeUndefined();
    expect(after.items[stepId]).toBeUndefined();
    expect(canSee(after, "jordan", sequence([out.event], s.seq)[0]!)).toBe(true);

    const there = space();
    const arrive = decideArrive(there, out.items, "maya", base);
    if (!arrive.ok) throw new Error(arrive.reason);
    const landed = applyEvents(there, sequence(arrive.events, there.seq));
    expect(landed.items[stepId]).toMatchObject({ status: "done", doneOn: ["2026-10-10"], parentId: goalId });
    // The same items can't land twice.
    expect(decideArrive(landed, out.items, "maya", base)).toMatchObject({ ok: false });
  });

  it("keeps a private item's move and arrival to its owner", () => {
    const { s, goalId } = goal("owner");
    const out = decideMoveOut(s, goalId, "maya", base);
    if (!out.ok) throw new Error(out.reason);
    const moved = sequence([out.event], s.seq)[0]!;
    expect(canSee(applyEvents(s, [moved]), "jordan", moved)).toBe(false);
    const there = space();
    const arrive = decideArrive(there, out.items, "maya", base);
    if (!arrive.ok) throw new Error(arrive.reason);
    const [arrived] = sequence(arrive.events, there.seq);
    const landed = applyEvents(there, [arrived!]);
    expect(canSee(landed, "jordan", arrived!)).toBe(false);
    expect(canSee(landed, "maya", arrived!)).toBe(true);
  });

  it("refuses other people's items, steps, non-members and forged owners", () => {
    const { s, goalId, stepId } = goal();
    expect(decideMoveOut(s, goalId, "jordan", base)).toMatchObject({ ok: false });
    expect(decideMoveOut(s, stepId, "maya", base)).toMatchObject({
      ok: false,
      reason: expect.stringContaining("goal"),
    });
    expect(decideMoveOut(s, goalId, "stranger", base)).toMatchObject({ ok: false });
    const out = decideMoveOut(s, goalId, "maya", base);
    if (!out.ok) throw new Error(out.reason);
    expect(decideArrive(space(), out.items, "jordan", base)).toMatchObject({ ok: false });
    expect(decideArrive(space(), out.items, "stranger", base)).toMatchObject({ ok: false });
  });

  it("picks which earlier events leave with the items", () => {
    const { s, goalId, stepId } = goal();
    const ids = new Set([goalId, stepId]);
    const line = s.messages.at(-1)!;
    const posted = {
      seq: line.seq,
      type: "message.posted" as const,
      actorId: "maya",
      commandId: null,
      at: AT,
      payload: { message: line },
    };
    expect(leavesWith(posted, ids, true)).toBe(false);
    expect(leavesWith(posted, ids, false)).toBe(true);
    const done = {
      seq: 9,
      type: "item.completed" as const,
      actorId: "maya",
      commandId: null,
      at: AT,
      payload: { itemId: stepId, on: "2026-10-10" },
    };
    expect(leavesWith(done, ids, true)).toBe(true);
    expect(leavesWith(done, new Set([newId()]), true)).toBe(false);
  });

  it("leaves someone else's old step behind on its own, and takes a private item's lines along", () => {
    const { s, goalId, stepId } = goal();
    const theirs = newId();
    const withTheirs = applyEvents(
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
                ...s.items[stepId]!,
                id: theirs,
                ownerId: "jordan",
                title: "Jordan's",
                status: "open",
                doneOn: [],
              },
            },
          },
        ],
        s.seq,
      ),
    );
    const out = decideMoveOut(withTheirs, goalId, "maya", base);
    if (!out.ok) throw new Error(out.reason);
    expect(out.items.map((i) => i.id)).not.toContain(theirs);
    const after = applyEvents(withTheirs, sequence([out.event], withTheirs.seq));
    expect(after.items[theirs]?.parentId).toBeNull();
    // A shared goal's completion line stays in the chat.
    expect(after.messages.some((m) => m.itemId === stepId)).toBe(true);

    const hidden = run(
      s,
      cmd({ type: "item.visibility", payload: { itemId: goalId, visibility: "owner" } }),
    ).state;
    const privateOut = decideMoveOut(hidden, goalId, "maya", base);
    if (!privateOut.ok) throw new Error(privateOut.reason);
    const gone = applyEvents(hidden, sequence([privateOut.event], hidden.seq));
    expect(gone.messages.some((m) => m.itemId === stepId)).toBe(false);
  });
});

describe("leaving and removing people", () => {
  it("lets a supporter leave and the owner remove one, keeping what they said and hiding their private items", () => {
    const itemId = newId();
    const privateId = newId();
    let s = run(
      space(),
      cmd({ type: "item.create", payload: { itemId, kind: "todo", title: "Shared one" } }),
      "jordan",
    ).state;
    s = run(
      s,
      cmd({
        type: "item.create",
        payload: { itemId: privateId, kind: "todo", title: "Mine", visibility: "owner" },
      }),
      "jordan",
    ).state;
    s = run(s, cmd({ type: "message.send", payload: { messageId: newId(), body: "hello" } }), "jordan").state;
    const out = decideRemove(s, "jordan", "maya", AT);
    if (!out.ok) throw new Error(out.reason);
    const after = applyEvents(s, sequence(out.events, s.seq));
    expect(after.members.jordan).toBeUndefined();
    expect(after.messages.map((m) => m.body)).toEqual(["hello"]);
    expect(viewFor(after, "maya").items[privateId]).toBeUndefined();
    expect(viewFor(after, "maya").items[itemId]).toBeDefined();
    // Once out, they can't change anything.
    expect(
      decide(after, cmd({ type: "item.complete", payload: { itemId, on: "2026-10-10" } }), "jordan"),
    ).toMatchObject({
      ok: false,
    });
    expect(decideRemove(s, "jordan", "jordan", AT)).toMatchObject({ ok: true });
  });

  it("won't let a supporter remove others or anyone remove the owner", () => {
    const s = space();
    expect(decideRemove(s, "maya", "jordan", AT)).toMatchObject({ ok: false });
    expect(decideRemove(s, "maya", "maya", AT)).toMatchObject({ ok: false });
    expect(decideRemove(s, "jordan", "stranger", AT)).toMatchObject({ ok: false });
    expect(decideRemove(s, "nobody", "maya", AT)).toEqual({ ok: true, events: [] });
  });
});

describe("weekly reflections", () => {
  const post = (wins: string, blockers = "", next = "") =>
    cmd({ type: "reflection.post", payload: { messageId: newId(), wins, blockers, next } });

  it("posts a reflection to the chat and reads it back", () => {
    const r = run(space(), post("Shipped the invite flow", "Sick two days", "First 10 users"));
    const message = r.state.messages.at(-1)!;
    expect(message.kind).toBe("reflection");
    expect(readReflection(message)).toEqual({
      wins: "Shipped the invite flow",
      blockers: "Sick two days",
      next: "First 10 users",
    });
    expect(canSee(r.state, "jordan", r.events[0]!)).toBe(true);
  });

  it("needs at least one part, and a resend is a no-op", () => {
    expect(decide(space(), post("", "", ""), "maya")).toMatchObject({ ok: false });
    const c = post("Ran 3 times");
    const r = run(space(), c);
    expect(decide(r.state, c, "maya")).toEqual({ ok: true, events: [] });
  });

  it("is due on weekends for owners with something shared, once a week", () => {
    const itemId = newId();
    let s = run(
      space(),
      cmd({ type: "item.create", payload: { itemId, kind: "goal", title: "Launch" } }),
    ).state;
    const saturday = new Date("2026-10-17T10:00:00");
    const wednesday = new Date("2026-10-14T10:00:00");
    expect(reflectionDue(s, "maya", saturday)).toBe(true);
    expect(reflectionDue(s, "maya", wednesday)).toBe(false);
    expect(reflectionDue(s, "jordan", saturday)).toBe(false);
    s = run(
      s,
      cmd({
        type: "reflection.post",
        payload: { messageId: newId(), wins: "x", blockers: "", next: "" },
        at: "2026-10-16T09:00:00.000Z",
      } as never),
    ).state;
    expect(reflectionDue(s, "maya", saturday)).toBe(false);
  });

  it("refuses a reflection too long to save, counting quotes and line breaks", () => {
    const heavy = '"\n'.repeat(450);
    const c = cmd({
      type: "reflection.post",
      payload: { messageId: newId(), wins: heavy, blockers: heavy, next: heavy },
    });
    expect(decide(space(), c, "maya")).toMatchObject({ ok: false, reason: expect.stringContaining("long") });
  });

  it("doesn't read a broken body as a reflection", () => {
    const r = run(space(), post("ok"));
    const broken = { ...r.state.messages.at(-1)!, body: "not json" };
    expect(readReflection(broken)).toBeNull();
  });
});

describe("taking a tick back, and deleting", () => {
  const todo = (title: string, extra: Partial<CommandInput["payload"]> = {}) => {
    const itemId = newId();
    return { itemId, c: cmd({ type: "item.create", payload: { itemId, kind: "todo", title, ...extra } }) };
  };

  it("reopens a finished to-do and takes its chat line and reactions with it", () => {
    const t = todo("Call the bank");
    let s = run(space(), t.c).state;
    s = run(s, cmd({ type: "item.complete", payload: { itemId: t.itemId, on: "2026-10-10" } })).state;
    const line = s.messages.find((m) => m.kind === "completion")!;
    s = run(
      s,
      cmd({ type: "reaction.toggle", payload: { messageId: line.id, emoji: "🎉" } }),
      "jordan",
    ).state;
    s = run(s, cmd({ type: "item.reopen", payload: { itemId: t.itemId, on: "2026-10-10" } })).state;
    expect(s.items[t.itemId]).toMatchObject({ status: "open", doneOn: [] });
    expect(s.messages).toEqual([]);
    expect(s.reactions[line.id]).toBeUndefined();
    // Ticking again works and posts again.
    s = run(s, cmd({ type: "item.complete", payload: { itemId: t.itemId, on: "2026-10-10" } })).state;
    expect(s.items[t.itemId]?.status).toBe("done");
    expect(s.messages).toHaveLength(1);
  });

  it("reopens a won't-do, and takes back only today's tick on a habit", () => {
    const t = todo("Fix the gate");
    let s = run(space(), t.c).state;
    s = run(s, cmd({ type: "item.wont", payload: { itemId: t.itemId, reason: "Moving out" } })).state;
    s = run(s, cmd({ type: "item.reopen", payload: { itemId: t.itemId, on: "2026-10-10" } })).state;
    expect(s.items[t.itemId]?.status).toBe("open");
    expect(s.messages).toEqual([]);

    const habitId = newId();
    s = run(
      s,
      cmd({
        type: "item.create",
        payload: { itemId: habitId, kind: "habit", title: "Gym", timesPerWeek: 3 },
      }),
    ).state;
    for (const on of ["2026-10-09", "2026-10-10"])
      s = run(s, cmd({ type: "item.complete", payload: { itemId: habitId, on } })).state;
    s = run(s, cmd({ type: "item.reopen", payload: { itemId: habitId, on: "2026-10-10" } })).state;
    expect(s.items[habitId]?.doneOn).toEqual(["2026-10-09"]);
    expect(s.messages.filter((m) => m.itemId === habitId)).toHaveLength(1);
  });

  it("does nothing for an open item, and only the owner can reopen or delete", () => {
    const t = todo("Write docs");
    const s = run(space(), t.c).state;
    expect(
      decide(s, cmd({ type: "item.reopen", payload: { itemId: t.itemId, on: "2026-10-10" } }), "maya"),
    ).toEqual({
      ok: true,
      events: [],
    });
    const done = run(
      s,
      cmd({ type: "item.complete", payload: { itemId: t.itemId, on: "2026-10-10" } }),
    ).state;
    expect(
      decide(done, cmd({ type: "item.reopen", payload: { itemId: t.itemId, on: "2026-10-10" } }), "jordan")
        .ok,
    ).toBe(false);
    expect(decide(done, cmd({ type: "item.delete", payload: { itemId: t.itemId } }), "jordan").ok).toBe(
      false,
    );
  });

  it("deletes a goal with its steps, keeping a shared item's chat lines", () => {
    const goalId = newId();
    const stepId = newId();
    let s = run(
      space(),
      cmd({ type: "item.create", payload: { itemId: goalId, kind: "goal", title: "Launch" } }),
    ).state;
    s = run(
      s,
      cmd({
        type: "item.create",
        payload: { itemId: stepId, kind: "todo", title: "Docs", parentId: goalId },
      }),
    ).state;
    s = run(s, cmd({ type: "item.complete", payload: { itemId: stepId, on: "2026-10-10" } })).state;
    const { state, events } = run(s, cmd({ type: "item.delete", payload: { itemId: goalId } }));
    expect(state.items).toEqual({});
    expect(state.messages).toHaveLength(1);
    expect(canSee(state, "jordan", events[0]!)).toBe(true);
  });

  it("keeps a private item's delete and reopen to its owner, and takes its lines along", () => {
    const t = todo("See therapist");
    let s = run(space(), t.c).state;
    s = run(s, cmd({ type: "item.complete", payload: { itemId: t.itemId, on: "2026-10-10" } })).state;
    s = run(s, cmd({ type: "item.visibility", payload: { itemId: t.itemId, visibility: "owner" } })).state;
    const reopened = run(s, cmd({ type: "item.reopen", payload: { itemId: t.itemId, on: "2026-10-10" } }));
    expect(canSee(reopened.state, "jordan", reopened.events[0]!)).toBe(false);
    const { state, events } = run(s, cmd({ type: "item.delete", payload: { itemId: t.itemId } }));
    expect(state.messages).toEqual([]);
    expect(canSee(state, "jordan", events[0]!)).toBe(false);
    expect(canSee(state, "maya", events[0]!)).toBe(true);
  });

  it("forgets a reopened item's events with it when it leaves the log", () => {
    const e = { seq: 9, type: "item.reopened", actorId: "maya", commandId: null, at: AT } as const;
    expect(
      leavesWith(
        { ...e, payload: { itemId: "a", on: "2026-10-10", messageId: null } } as SpaceEvent,
        new Set(["a"]),
        true,
      ),
    ).toBe(true);
  });
});

describe("review fixes for reopen and delete", () => {
  /** Run commands, keeping the numbered log like a room does. */
  function logOf(...cmds: Command[]) {
    let state = space();
    const log: SpaceEvent[] = [];
    for (const c of cmds) {
      const r = run(state, c);
      state = r.state;
      log.push(...r.events);
    }
    return { state, log };
  }
  /** What the room does on delete: commit, rewrite the log, rebuild from it. */
  function deleteAndRebuild(start: { state: SpaceState; log: SpaceEvent[] }, itemId: string) {
    const r = run(start.state, cmd({ type: "item.delete", payload: { itemId } }));
    const e = r.events[0]!;
    if (e.type !== "item.deleted") throw new Error("no delete");
    const { drop, rewrite } = forgetPlan(
      start.log,
      new Set(e.payload.itemIds),
      e.payload.visibility === "space",
    );
    const byNumber = new Map(rewrite.map((x) => [x.seq, x]));
    const log = [...start.log.filter((x) => !drop.includes(x.seq)).map((x) => byNumber.get(x.seq) ?? x), e];
    return applyEvents(
      space(),
      log.filter((x) => x.seq > 3),
    );
  }

  it("deleting a step keeps its private goal private", () => {
    const goal = newId();
    const step = newId();
    const start = logOf(
      cmd({ type: "item.create", payload: { itemId: goal, kind: "goal", title: "Secret plan" } }),
      cmd({ type: "item.create", payload: { itemId: step, kind: "todo", title: "Step", parentId: goal } }),
      cmd({ type: "item.visibility", payload: { itemId: goal, visibility: "owner" } }),
    );
    const rebuilt = deleteAndRebuild(start, step);
    expect(rebuilt.items[goal]?.visibility).toBe("owner");
    expect(viewFor(rebuilt, "jordan").items[goal]).toBeUndefined();
  });

  it("deleting a step keeps a goal that arrived with it", () => {
    const goal = newId();
    const step = newId();
    const base = { id: goal, kind: "goal", title: "Moved goal", ownerId: "maya", parentId: null } as const;
    const item = (over: object) => ({
      visibility: "space" as const,
      status: "open" as const,
      dueOn: null,
      dueTime: null,
      timesPerWeek: null,
      doneOn: [],
      skippedOn: [],
      notes: "",
      repeat: null,
      createdAt: AT,
      ...base,
      ...over,
    });
    const arrival: SpaceEvent = {
      seq: 4,
      type: "item.arrived",
      actorId: "maya",
      commandId: null,
      at: AT,
      payload: { items: [item({}), item({ id: step, kind: "todo", title: "Step", parentId: goal })] },
    };
    const state = applyEvents(space(), [arrival]);
    const rebuilt = deleteAndRebuild({ state, log: [arrival] }, step);
    expect(rebuilt.items[goal]?.title).toBe("Moved goal");
    expect(rebuilt.items[step]).toBeUndefined();
  });

  it("a line a reopen took back stays gone after the item is deleted", () => {
    const itemId = newId();
    const start = logOf(
      cmd({ type: "item.create", payload: { itemId, kind: "todo", title: "Oops" } }),
      cmd({ type: "item.complete", payload: { itemId, on: "2026-10-10" } }),
      cmd({ type: "item.reopen", payload: { itemId, on: "2026-10-10" } }),
    );
    expect(deleteAndRebuild(start, itemId).messages).toEqual([]);
  });

  it("reopening a habit's day removes that day's line, not another", () => {
    const habitId = newId();
    let s = run(
      space(),
      cmd({
        type: "item.create",
        payload: { itemId: habitId, kind: "habit", title: "Gym", timesPerWeek: 3 },
      }),
    ).state;
    s = run(s, cmd({ type: "item.complete", payload: { itemId: habitId, on: "2026-10-09" } })).state;
    const yesterday = s.messages[0]!.id;
    s = run(s, cmd({ type: "item.visibility", payload: { itemId: habitId, visibility: "owner" } })).state;
    s = run(s, cmd({ type: "item.complete", payload: { itemId: habitId, on: "2026-10-10" } })).state;
    s = run(s, cmd({ type: "item.visibility", payload: { itemId: habitId, visibility: "space" } })).state;
    s = run(s, cmd({ type: "item.reopen", payload: { itemId: habitId, on: "2026-10-10" } })).state;
    expect(s.messages.map((m) => m.id)).toEqual([yesterday]);
    expect(s.items[habitId]?.doneOn).toEqual(["2026-10-09"]);
  });

  it("a won't-do set while private takes back no older line when reopened", () => {
    const itemId = newId();
    let s = run(
      space(),
      cmd({ type: "item.create", payload: { itemId, kind: "todo", title: "Gate" } }),
    ).state;
    s = run(s, cmd({ type: "item.wont", payload: { itemId, reason: "first" } })).state;
    s = run(s, cmd({ type: "item.reopen", payload: { itemId, on: "2026-10-10" } })).state;
    s = run(s, cmd({ type: "item.skip", payload: { itemId, on: "2026-10-10", reason: "busy" } })).state;
    s = run(s, cmd({ type: "item.visibility", payload: { itemId, visibility: "owner" } })).state;
    s = run(s, cmd({ type: "item.wont", payload: { itemId, reason: null } })).state;
    s = run(s, cmd({ type: "item.visibility", payload: { itemId, visibility: "space" } })).state;
    const before = s.messages.length;
    s = run(s, cmd({ type: "item.reopen", payload: { itemId, on: "2026-10-10" } })).state;
    expect(s.messages).toHaveLength(before);
  });

  it("reopens a habit marked won't do, keeping its ticks", () => {
    const habitId = newId();
    let s = run(
      space(),
      cmd({
        type: "item.create",
        payload: { itemId: habitId, kind: "habit", title: "Gym", timesPerWeek: 3 },
      }),
    ).state;
    s = run(s, cmd({ type: "item.complete", payload: { itemId: habitId, on: "2026-10-09" } })).state;
    s = run(s, cmd({ type: "item.wont", payload: { itemId: habitId, reason: null } })).state;
    s = run(s, cmd({ type: "item.reopen", payload: { itemId: habitId, on: "2026-10-10" } })).state;
    expect(s.items[habitId]).toMatchObject({ status: "open", doneOn: ["2026-10-09"] });
  });
});

describe("notes", () => {
  it("keeps notes from creating, changes them with an edit, and reads old items as empty", () => {
    const itemId = newId();
    let s = run(
      space(),
      cmd({
        type: "item.create",
        payload: { itemId, kind: "todo", title: "Call the bank", notes: "Ask for Sam" },
      }),
    ).state;
    expect(s.items[itemId]?.notes).toBe("Ask for Sam");
    s = run(s, cmd({ type: "item.edit", payload: { itemId, notes: "Ask for Sam, ext 204" } })).state;
    expect(s.items[itemId]?.notes).toBe("Ask for Sam, ext 204");
    expect(
      decide(s, cmd({ type: "item.edit", payload: { itemId, notes: "Ask for Sam, ext 204" } }), "maya"),
    ).toEqual({
      ok: true,
      events: [],
    });
    const { notes: _, ...old } = s.items[itemId]!;
    expect(normalizeSpace({ ...s, items: { [itemId]: old as never } }).items[itemId]?.notes).toBe("");
  });
});

describe("repeating to-dos", () => {
  it("finds the next date for each kind of repeat", () => {
    // 2026-10-15 is a Thursday.
    expect(nextRepeat({ kind: "week", days: [1, 4] }, "2026-10-15", "2026-10-15")).toBe("2026-10-19");
    expect(nextRepeat({ kind: "days", every: 3 }, "2026-10-20", "2026-10-15")).toBe("2026-10-21");
    expect(nextRepeat({ kind: "month" }, "2026-01-31", "2026-01-31")).toBe("2026-02-28");
    expect(nextRepeat({ kind: "month" }, "2026-10-15", "2026-10-15")).toBe("2026-11-15");
  });

  it("moves to its next date when ticked or skipped, and Undo puts it back", () => {
    const itemId = newId();
    let s = run(
      space(),
      cmd({
        type: "item.create",
        payload: {
          itemId,
          kind: "todo",
          title: "Bins",
          dueOn: "2026-10-12",
          repeat: { kind: "week", days: [1] },
        },
      }),
    ).state;
    // Ticked late, on Wednesday: the next one is the coming Monday, not the one already gone.
    s = run(s, cmd({ type: "item.complete", payload: { itemId, on: "2026-10-14" } })).state;
    expect(s.items[itemId]).toMatchObject({ status: "open", dueOn: "2026-10-19", doneOn: ["2026-10-14"] });
    expect(s.messages).toHaveLength(1);
    // A second tick the same day changes nothing.
    expect(decide(s, cmd({ type: "item.complete", payload: { itemId, on: "2026-10-14" } }), "maya")).toEqual({
      ok: true,
      events: [],
    });
    s = run(s, cmd({ type: "item.reopen", payload: { itemId, on: "2026-10-14" } })).state;
    expect(s.items[itemId]).toMatchObject({ status: "open", dueOn: "2026-10-12", doneOn: [] });
    expect(s.messages).toEqual([]);
    s = run(s, cmd({ type: "item.skip", payload: { itemId, on: "2026-10-12", reason: null } })).state;
    expect(s.items[itemId]?.dueOn).toBe("2026-10-19");
  });

  it("only to-dos with a date repeat", () => {
    const repeat = { kind: "month" } as const;
    const no = (payload: object) =>
      decide(
        space(),
        cmd({ type: "item.create", payload: { itemId: newId(), title: "x", ...payload } as never }),
        "maya",
      ).ok;
    expect(no({ kind: "todo", repeat })).toBe(false);
    expect(no({ kind: "habit", timesPerWeek: 3, repeat })).toBe(false);
    expect(no({ kind: "todo", dueOn: "2026-10-15", repeat })).toBe(true);
  });
});
