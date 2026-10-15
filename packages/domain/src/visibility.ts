import type { SpaceEvent, UserId } from "@buildpair/protocol";
import type { SpaceState } from "./state";

/**
 * Whether a person may receive an event. Events about "only visible to me" items go to their
 * owner alone. Pass the state *after* the event was applied so newly created items are known.
 */
export function canSee(state: SpaceState, userId: UserId, event: SpaceEvent): boolean {
  const itemId =
    event.type === "item.created"
      ? event.payload.item.id
      : event.type === "item.completed" ||
          event.type === "item.skipped" ||
          event.type === "item.wont" ||
          event.type === "item.edited"
        ? event.payload.itemId
        : event.type === "message.posted"
          ? event.payload.message.itemId
          : null;
  if (!itemId) return true;
  const item = state.items[itemId];
  return !item || item.visibility === "space" || item.ownerId === userId;
}

/** The space as one person may see it: private items of others removed. */
export function viewFor(state: SpaceState, userId: UserId): SpaceState {
  const items = Object.fromEntries(
    Object.entries(state.items).filter(([, i]) => i.visibility === "space" || i.ownerId === userId),
  );
  return { ...state, items };
}
