import type { Item, Member, Message, SpaceColor, SpaceEvent, UserId } from "@buildpair/protocol";

export interface SpaceState {
  /** Sequence number of the last event applied. */
  seq: number;
  name: string;
  purpose: string;
  /** Picked by the owner; null means the automatic color. */
  color: SpaceColor | null;
  members: Record<UserId, Member>;
  items: Record<string, Item>;
  /** Chat log in sequence order. */
  messages: Message[];
  /** messageId -> emoji -> user IDs who reacted. */
  reactions: Record<string, Record<string, UserId[]>>;
}

export function emptySpace(): SpaceState {
  return { seq: 0, name: "", purpose: "", color: null, members: {}, items: {}, messages: [], reactions: {} };
}

/**
 * Apply one numbered event. Pure: returns a new state and never mutates the input.
 * Events must arrive in sequence order; anything at or below the current seq is ignored,
 * which makes replays after a reconnect harmless.
 */
export function applyEvent(state: SpaceState, event: SpaceEvent): SpaceState {
  if (event.seq <= state.seq) return state;
  const next: SpaceState = { ...state, seq: event.seq };
  switch (event.type) {
    case "space.created":
      next.name = event.payload.name;
      next.purpose = event.payload.purpose;
      break;
    case "space.edited": {
      const { name, purpose, color } = event.payload.changes;
      if (name !== undefined) next.name = name;
      if (purpose !== undefined) next.purpose = purpose;
      if (color !== undefined) next.color = color;
      break;
    }
    case "member.joined":
      next.members = { ...state.members, [event.payload.member.userId]: event.payload.member };
      break;
    case "member.erased": {
      const gone = event.payload.userId;
      const { [gone]: _, ...members } = state.members;
      next.members = members;
      next.items = Object.fromEntries(Object.entries(state.items).filter(([, i]) => i.ownerId !== gone));
      next.messages = state.messages.filter((m) => m.authorId !== gone);
      // Their reactions go, and so do reactions on their messages.
      const kept = new Set(next.messages.map((m) => m.id));
      next.reactions = Object.fromEntries(
        Object.entries(state.reactions)
          .filter(([messageId]) => kept.has(messageId))
          .map(([messageId, byEmoji]) => [
            messageId,
            Object.fromEntries(
              Object.entries(byEmoji)
                .map(([emoji, users]) => [emoji, users.filter((u) => u !== gone)] as const)
                .filter(([, users]) => users.length > 0),
            ),
          ]),
      );
      break;
    }
    case "item.created":
      next.items = { ...state.items, [event.payload.item.id]: normalizeItem(event.payload.item) };
      break;
    case "item.edited": {
      const item = state.items[event.payload.itemId];
      if (item) next.items = { ...state.items, [item.id]: { ...item, ...event.payload.changes } };
      break;
    }
    case "item.completed": {
      const item = state.items[event.payload.itemId];
      if (!item) break;
      const updated: Item =
        item.kind === "habit"
          ? {
              ...item,
              doneOn: item.doneOn.includes(event.payload.on)
                ? item.doneOn
                : [...item.doneOn, event.payload.on].sort(),
            }
          : { ...item, status: "done", doneOn: [event.payload.on] };
      next.items = { ...state.items, [item.id]: updated };
      break;
    }
    case "item.skipped": {
      // The reason lives in the chat; the item remembers the day so it isn't skipped twice.
      const item = state.items[event.payload.itemId];
      if (item && !item.skippedOn.includes(event.payload.on))
        next.items = {
          ...state.items,
          [item.id]: { ...item, skippedOn: [...item.skippedOn, event.payload.on].sort() },
        };
      break;
    }
    case "item.wont": {
      const item = state.items[event.payload.itemId];
      if (item) next.items = { ...state.items, [item.id]: { ...item, status: "wont" } };
      break;
    }
    case "message.posted":
      next.messages = [...state.messages, { ...event.payload.message, seq: event.seq }];
      break;
    case "reaction.toggled": {
      const { messageId, emoji, userId, on } = event.payload;
      const forMessage = { ...(state.reactions[messageId] ?? {}) };
      const users = (forMessage[emoji] ?? []).filter((u) => u !== userId);
      if (on) users.push(userId);
      if (users.length) forMessage[emoji] = users;
      else delete forMessage[emoji];
      next.reactions = { ...state.reactions, [messageId]: forMessage };
      break;
    }
  }
  return next;
}

/**
 * Fill fields added after an item was saved, so older items (in the server's log or a device's copy)
 * read like new ones.
 */
export function normalizeItem(item: Item): Item {
  return {
    ...item,
    dueTime: item.dueTime ?? null,
    skippedOn: item.skippedOn ?? [],
    doneOn: item.doneOn ?? [],
  };
}

/** The same, for a whole saved space. */
export function normalizeSpace(state: SpaceState): SpaceState {
  return {
    ...state,
    color: state.color ?? null,
    items: Object.fromEntries(Object.entries(state.items).map(([k, i]) => [k, normalizeItem(i)])),
  };
}

export function applyEvents(state: SpaceState, events: readonly SpaceEvent[]): SpaceState {
  return events.reduce(applyEvent, state);
}

/** Number events in order, continuing from `afterSeq`. Only the space's room calls this for real. */
export function sequence(
  events: readonly import("@buildpair/protocol").UnsequencedEvent[],
  afterSeq: number,
): SpaceEvent[] {
  return events.map((e, i) => ({ ...e, seq: afterSeq + i + 1 }) as SpaceEvent);
}
