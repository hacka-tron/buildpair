import type { SpaceEvent, UserId } from "@buildpair/protocol";
import type { SpaceState } from "./state";

const visibleTo = (state: SpaceState, userId: UserId, itemId: string | null | undefined) => {
  const item = itemId ? state.items[itemId] : undefined;
  return !item || item.visibility === "space" || item.ownerId === userId;
};

/**
 * Whether a person may receive an event. Events about "only visible to me" items, and chat lines and
 * reactions about them, go to their owner alone. Pass the state *after* the event was applied so newly
 * created items are known.
 */
export function canSee(state: SpaceState, userId: UserId, event: SpaceEvent): boolean {
  switch (event.type) {
    case "item.created":
      return visibleTo(state, userId, event.payload.item.id);
    case "item.completed":
    case "item.skipped":
    case "item.wont":
    case "item.reopened":
    case "item.edited":
      return visibleTo(state, userId, event.payload.itemId);
    case "item.visibility":
      // Going private carries only IDs, so everyone gets it and drops the items. Going shared carries
      // the items, so it goes only to people who may see them now.
      return event.payload.visibility === "owner" || visibleTo(state, userId, event.payload.itemIds[0]);
    case "item.moved":
    case "item.deleted":
      return event.payload.visibility === "space" || event.actorId === userId;
    case "item.arrived":
      return visibleTo(state, userId, event.payload.items[0]?.id);
    case "message.posted":
      return visibleTo(state, userId, event.payload.message.itemId);
    case "reaction.toggled": {
      const message = state.messages.find((m) => m.id === event.payload.messageId);
      return visibleTo(state, userId, message?.itemId);
    }
    default:
      return true;
  }
}

/**
 * The space as one person may see it: other people's private items removed, with the chat lines and
 * reactions about them. Devices keep only this, so an item made private leaves the others' devices.
 */
export function viewFor(state: SpaceState, userId: UserId): SpaceState {
  const hidden = Object.values(state.items).filter((i) => !visibleTo(state, userId, i.id));
  if (hidden.length === 0) return state;
  const gone = new Set(hidden.map((i) => i.id));
  const items = Object.fromEntries(Object.entries(state.items).filter(([id]) => !gone.has(id)));
  const messages = state.messages.filter((m) => !m.itemId || !gone.has(m.itemId));
  const kept = new Set(messages.map((m) => m.id));
  const reactions = Object.fromEntries(Object.entries(state.reactions).filter(([id]) => kept.has(id)));
  return { ...state, items, messages, reactions };
}
