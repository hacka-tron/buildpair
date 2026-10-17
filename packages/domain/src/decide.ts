import type { Command, Item, Message, UnsequencedEvent, UserId } from "@buildpair/protocol";
import type { SpaceState } from "./state";

export type Decision = { ok: true; events: UnsequencedEvent[] } | { ok: false; reason: string };

const reject = (reason: string): Decision => ({ ok: false, reason });

/**
 * Turn a command into the events it produces, or a reason it can't happen.
 * The same function runs on the device (to update the screen at once) and in the space's
 * room on the server (for real), so the two can't disagree about the rules.
 */
export function decide(state: SpaceState, command: Command, actorId: UserId): Decision {
  if (!state.members[actorId]) return reject("You're not a member of this space.");
  const base = { actorId, commandId: command.id, at: command.at };
  const chat = (kind: Message["kind"], body: string, itemId: string | null, messageId = command.id) => ({
    ...base,
    type: "message.posted" as const,
    payload: {
      message: { id: messageId, seq: 0, authorId: actorId, kind, body, itemId, createdAt: command.at },
    },
  });
  const ownItem = (itemId: string): Item | string => {
    const item = state.items[itemId];
    if (!item) return "That item no longer exists.";
    if (item.ownerId !== actorId) return "Only the person who added this item can change it.";
    return item;
  };
  // Items marked "only visible to me" never post to the chat.
  const shared = (item: Item) => item.visibility === "space";

  switch (command.type) {
    case "item.create": {
      const p = command.payload;
      if (state.items[p.itemId]) return reject("An item with this ID already exists.");
      const parent = p.parentId ? state.items[p.parentId] : undefined;
      if (p.parentId) {
        // Steps go one level deep, under your own goal, so a goal and its steps change together.
        if (parent?.kind !== "goal" || parent.parentId || p.kind === "goal")
          return reject("Steps can only be added under a goal.");
        if (parent.ownerId !== actorId)
          return reject("Only the person who added this goal can add steps to it.");
      }
      if (p.kind === "habit" && !p.timesPerWeek) return reject("A habit needs a number of times per week.");
      if (p.dueTime && (p.kind === "habit" || !p.dueOn)) return reject("A time needs a day to go with it.");
      const item: Item = {
        id: p.itemId,
        kind: p.kind,
        title: p.title,
        ownerId: actorId,
        parentId: p.parentId,
        // Steps follow their goal, so a private goal never has a shared step.
        visibility: parent?.visibility ?? p.visibility,
        status: "open",
        dueOn: p.kind === "habit" ? null : p.dueOn,
        dueTime: p.kind === "habit" ? null : p.dueTime,
        timesPerWeek: p.kind === "habit" ? p.timesPerWeek : null,
        doneOn: [],
        skippedOn: [],
        notes: p.notes,
        createdAt: command.at,
      };
      return { ok: true, events: [{ ...base, type: "item.created", payload: { item } }] };
    }
    case "space.edit": {
      if (state.members[actorId]?.role !== "owner")
        return reject("Only the space's owner can change its details.");
      const asked = command.payload;
      const changes: typeof asked = {};
      if (asked.name !== undefined && asked.name !== state.name) changes.name = asked.name;
      if (asked.purpose !== undefined && asked.purpose !== state.purpose) changes.purpose = asked.purpose;
      if (asked.color !== undefined && asked.color !== state.color) changes.color = asked.color;
      if (Object.keys(changes).length === 0) return { ok: true, events: [] };
      return { ok: true, events: [{ ...base, type: "space.edited", payload: { changes } }] };
    }
    case "item.edit": {
      const item = ownItem(command.payload.itemId);
      if (typeof item === "string") return reject(item);
      if (item.status !== "open")
        return reject(
          "This item is finished or marked won't do, so it can't be changed. Add a new one instead.",
        );
      const { itemId: _, ...asked } = command.payload;
      const changes: typeof asked = {};
      if (asked.title !== undefined && asked.title !== item.title) changes.title = asked.title;
      if (asked.notes !== undefined && asked.notes !== item.notes) changes.notes = asked.notes;
      if (item.kind === "habit") {
        if (asked.dueOn || asked.dueTime) return reject("Habits repeat, so they don't take a date.");
        if (asked.timesPerWeek !== undefined && asked.timesPerWeek !== item.timesPerWeek)
          changes.timesPerWeek = asked.timesPerWeek;
      } else {
        if (asked.timesPerWeek !== undefined) return reject("Only habits have times per week.");
        if (asked.dueOn !== undefined && asked.dueOn !== item.dueOn) changes.dueOn = asked.dueOn;
        if (asked.dueTime !== undefined && asked.dueTime !== item.dueTime) changes.dueTime = asked.dueTime;
        // Clearing the day clears its time too.
        if (asked.dueOn === null && item.dueTime) changes.dueTime = null;
        const day = changes.dueOn !== undefined ? changes.dueOn : item.dueOn;
        const time = changes.dueTime !== undefined ? changes.dueTime : item.dueTime;
        if (time && !day) return reject("A time needs a day to go with it.");
      }
      if (Object.keys(changes).length === 0) return { ok: true, events: [] };
      return { ok: true, events: [{ ...base, type: "item.edited", payload: { itemId: item.id, changes } }] };
    }
    case "item.visibility": {
      const item = ownItem(command.payload.itemId);
      if (typeof item === "string") return reject(item);
      if (item.parentId) return reject("Steps follow their goal. Change who can see the goal instead.");
      const visibility = command.payload.visibility;
      // Only your own steps: older data may hold someone else's step under your goal.
      const family = [
        item,
        ...Object.values(state.items).filter((i) => i.parentId === item.id && i.ownerId === actorId),
      ];
      const changing = family.filter((i) => i.visibility !== visibility);
      if (changing.length === 0) return { ok: true, events: [] };
      const itemIds = changing.map((i) => i.id);
      const payload = { itemIds, visibility, items: [] as Item[], messages: [] as Message[], reactions: {} };
      if (visibility === "space") {
        // The others never received these items, so the event carries them whole.
        const ids = new Set(itemIds);
        payload.items = changing.map((i) => ({ ...i, visibility }));
        payload.messages = state.messages.filter((m) => m.itemId && ids.has(m.itemId));
        payload.reactions = Object.fromEntries(
          payload.messages.flatMap((m) => (state.reactions[m.id] ? [[m.id, state.reactions[m.id]]] : [])),
        );
      }
      return { ok: true, events: [{ ...base, type: "item.visibility", payload }] };
    }
    case "item.complete": {
      const item = ownItem(command.payload.itemId);
      if (typeof item === "string") return reject(item);
      if (item.kind !== "habit" && item.status !== "open") return reject("This item is already closed.");
      if (item.kind === "habit" && item.doneOn.includes(command.payload.on)) return { ok: true, events: [] };
      const events: UnsequencedEvent[] = [
        { ...base, type: "item.completed", payload: { itemId: item.id, on: command.payload.on } },
      ];
      if (shared(item)) events.push(chat("completion", item.title, item.id));
      return { ok: true, events };
    }
    case "item.reopen": {
      const item = ownItem(command.payload.itemId);
      if (typeof item === "string") return reject(item);
      const { on } = command.payload;
      const wont = item.status === "wont";
      const ticked = wont || (item.kind === "habit" ? item.doneOn.includes(on) : item.status === "done");
      if (!ticked) return { ok: true, events: [] };
      // Exactly the line that tick (or "won't do") posted, if it's still in the chat.
      const lineId =
        state.tickLines[item.id]?.[wont ? "wont" : item.kind === "habit" ? on : (item.doneOn[0] ?? on)];
      const line = lineId ? state.messages.find((m) => m.id === lineId && m.authorId === actorId) : undefined;
      return {
        ok: true,
        events: [
          { ...base, type: "item.reopened", payload: { itemId: item.id, on, messageId: line?.id ?? null } },
        ],
      };
    }
    case "item.delete": {
      const item = ownItem(command.payload.itemId);
      if (typeof item === "string") return reject(item);
      // Only your own steps: older data may hold someone else's step under your goal.
      const itemIds = [
        item.id,
        ...Object.values(state.items)
          .filter((i) => i.parentId === item.id && i.ownerId === actorId)
          .map((i) => i.id),
      ];
      return {
        ok: true,
        events: [{ ...base, type: "item.deleted", payload: { itemIds, visibility: item.visibility } }],
      };
    }
    case "item.skip": {
      const item = ownItem(command.payload.itemId);
      if (typeof item === "string") return reject(item);
      if (item.kind === "goal") return reject("Goals can't be skipped; skip one of their steps instead.");
      if (item.skippedOn.includes(command.payload.on)) return { ok: true, events: [] };
      const events: UnsequencedEvent[] = [
        { ...base, type: "item.skipped", payload: { itemId: item.id, on: command.payload.on } },
      ];
      if (shared(item)) events.push(chat("skip", command.payload.reason ?? "", item.id));
      return { ok: true, events };
    }
    case "item.wont": {
      const item = ownItem(command.payload.itemId);
      if (typeof item === "string") return reject(item);
      if (item.status !== "open") return reject("This item is already closed.");
      const events: UnsequencedEvent[] = [{ ...base, type: "item.wont", payload: { itemId: item.id } }];
      if (shared(item)) events.push(chat("skip", command.payload.reason ?? "", item.id));
      return { ok: true, events };
    }
    case "item.update": {
      const item = ownItem(command.payload.itemId);
      if (typeof item === "string") return reject(item);
      if (!shared(item)) return reject("Updates on private items aren't shared; edit the item instead.");
      return { ok: true, events: [chat("update", command.payload.body, item.id)] };
    }
    case "message.send":
      if (state.messages.some((m) => m.id === command.payload.messageId)) return { ok: true, events: [] };
      return { ok: true, events: [chat("text", command.payload.body, null, command.payload.messageId)] };
    case "reflection.post": {
      const { messageId } = command.payload;
      if (state.messages.some((m) => m.id === messageId)) return { ok: true, events: [] };
      const [wins, blockers, next] = [
        command.payload.wins,
        command.payload.blockers,
        command.payload.next,
      ].map((t) => t.trim());
      if (!wins && !blockers && !next) return reject("Write at least one part of your reflection.");
      const body = JSON.stringify({ wins, blockers, next });
      // A chat message holds 4000 characters; quotes and line breaks take more room once saved.
      if (body.length > 4000) return reject("That reflection is a bit long. Shorten it a little so it fits.");
      return { ok: true, events: [chat("reflection", body, null, messageId)] };
    }
    case "reaction.toggle": {
      const { messageId, emoji } = command.payload;
      const message = state.messages.find((m) => m.id === messageId);
      const about = message?.itemId ? state.items[message.itemId] : undefined;
      // A line about someone else's private item is hidden from this person, so it doesn't exist for them.
      if (!message || (about && about.visibility === "owner" && about.ownerId !== actorId))
        return reject("That message no longer exists.");
      const on = !(state.reactions[messageId]?.[emoji] ?? []).includes(actorId);
      return {
        ok: true,
        events: [{ ...base, type: "reaction.toggled", payload: { messageId, emoji, userId: actorId, on } }],
      };
    }
  }
}
