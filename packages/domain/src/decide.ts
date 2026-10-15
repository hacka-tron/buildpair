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
      if (p.parentId) {
        const parent = state.items[p.parentId];
        if (parent?.kind !== "goal") return reject("Steps can only be added under a goal.");
      }
      if (p.kind === "habit" && !p.timesPerWeek) return reject("A habit needs a number of times per week.");
      if (p.dueTime && (p.kind === "habit" || !p.dueOn)) return reject("A time needs a day to go with it.");
      const item: Item = {
        id: p.itemId,
        kind: p.kind,
        title: p.title,
        ownerId: actorId,
        parentId: p.parentId,
        visibility: p.visibility,
        status: "open",
        dueOn: p.kind === "habit" ? null : p.dueOn,
        dueTime: p.kind === "habit" ? null : p.dueTime,
        timesPerWeek: p.kind === "habit" ? p.timesPerWeek : null,
        doneOn: [],
        skippedOn: [],
        createdAt: command.at,
      };
      return { ok: true, events: [{ ...base, type: "item.created", payload: { item } }] };
    }
    case "item.edit": {
      const item = ownItem(command.payload.itemId);
      if (typeof item === "string") return reject(item);
      if (item.status !== "open") return reject("This item is closed. Reopen it to change it.");
      const { itemId: _, ...asked } = command.payload;
      const changes: typeof asked = {};
      if (asked.title !== undefined && asked.title !== item.title) changes.title = asked.title;
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
    case "reaction.toggle": {
      const { messageId, emoji } = command.payload;
      if (!state.messages.some((m) => m.id === messageId)) return reject("That message no longer exists.");
      const on = !(state.reactions[messageId]?.[emoji] ?? []).includes(actorId);
      return {
        ok: true,
        events: [{ ...base, type: "reaction.toggled", payload: { messageId, emoji, userId: actorId, on } }],
      };
    }
  }
}
