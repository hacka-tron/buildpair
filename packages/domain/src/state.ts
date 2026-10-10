import type { Item, Member, Message, SpaceEvent, UserId } from "@buildpair/protocol";

export interface SpaceState {
  /** Sequence number of the last event applied. */
  seq: number;
  name: string;
  purpose: string;
  members: Record<UserId, Member>;
  items: Record<string, Item>;
  /** Chat log in sequence order. */
  messages: Message[];
  /** messageId -> emoji -> user IDs who reacted. */
  reactions: Record<string, Record<string, UserId[]>>;
}

export function emptySpace(): SpaceState {
  return { seq: 0, name: "", purpose: "", members: {}, items: {}, messages: [], reactions: {} };
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
    case "member.joined":
      next.members = { ...state.members, [event.payload.member.userId]: event.payload.member };
      break;
    case "item.created":
      next.items = { ...state.items, [event.payload.item.id]: event.payload.item };
      break;
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
          : { ...item, status: "done" };
      next.items = { ...state.items, [item.id]: updated };
      break;
    }
    case "item.skipped":
      // Skips change nothing on the item itself; the reason lives in the chat.
      break;
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
