import type { Item, SpaceEvent, UnsequencedEvent, UserId } from "@buildpair/protocol";
import type { SpaceState } from "./state";

type Reject = { ok: false; reason: string };

/**
 * Moving an item to another space, first half: what leaves this one. Only the person who added a
 * top-level item can move it, and a goal takes their own steps along. Runs in the room the item leaves.
 */
export function decideMoveOut(
  state: SpaceState,
  itemId: string,
  actorId: UserId,
  base: { commandId: string; at: string },
): { ok: true; items: Item[]; event: UnsequencedEvent } | Reject {
  if (!state.members[actorId]) return { ok: false, reason: "You're not a member of this space." };
  const item = state.items[itemId];
  if (!item) return { ok: false, reason: "That item no longer exists." };
  if (item.ownerId !== actorId)
    return { ok: false, reason: "Only the person who added this item can move it." };
  if (item.parentId) return { ok: false, reason: "Steps move with their goal. Move the goal instead." };
  const items = [
    item,
    ...Object.values(state.items).filter((i) => i.parentId === item.id && i.ownerId === actorId),
  ];
  return {
    ok: true,
    items,
    event: {
      ...base,
      actorId,
      type: "item.moved",
      payload: { itemIds: items.map((i) => i.id), visibility: item.visibility },
    },
  };
}

/** Second half: the items arrive in the space they were moved to, owned by the same person. */
export function decideArrive(
  state: SpaceState,
  items: Item[],
  actorId: UserId,
  base: { commandId: string; at: string },
): { ok: true; events: UnsequencedEvent[] } | Reject {
  if (!state.members[actorId]) return { ok: false, reason: "You're not a member of the space you picked." };
  if (items.length === 0 || items.some((i) => i.ownerId !== actorId))
    return { ok: false, reason: "Only the person who added this item can move it." };
  if (items.some((i) => state.items[i.id]))
    return { ok: false, reason: "This item is already in that space." };
  return { ok: true, events: [{ ...base, actorId, type: "item.arrived", payload: { items } }] };
}

/**
 * Whether an event in the log is about these items and should leave with them. Chat lines about shared
 * items stay (they're part of the space's conversation); lines about private ones go.
 */
export function leavesWith(event: SpaceEvent, ids: ReadonlySet<string>, keepLines: boolean): boolean {
  switch (event.type) {
    case "item.created":
      return ids.has(event.payload.item.id);
    case "item.edited":
    case "item.completed":
    case "item.skipped":
    case "item.wont":
    case "item.reopened":
      return ids.has(event.payload.itemId);
    case "item.visibility":
      return event.payload.itemIds.some((id) => ids.has(id));
    case "item.arrived":
      return event.payload.items.some((i) => ids.has(i.id));
    case "message.posted":
      return !keepLines && Boolean(event.payload.message.itemId && ids.has(event.payload.message.itemId));
    default:
      return false;
  }
}
