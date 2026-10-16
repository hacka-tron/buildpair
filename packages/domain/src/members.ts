import type { UnsequencedEvent, UserId } from "@buildpair/protocol";
import type { SpaceState } from "./state";

/**
 * Someone leaves a space, or its owner removes them. Supporters may leave; the owner may remove a
 * supporter; nobody removes the owner (they delete the space by deleting their account, for now).
 */
export function decideRemove(
  state: SpaceState,
  userId: UserId,
  actorId: UserId,
  at: string,
): { ok: true; events: UnsequencedEvent[] } | { ok: false; reason: string } {
  const actor = state.members[actorId];
  if (!actor) return { ok: false, reason: "You're not a member of this space." };
  const target = state.members[userId];
  if (!target) return { ok: true, events: [] };
  if (target.role === "owner") return { ok: false, reason: "The owner can't leave their own space." };
  if (actorId !== userId && actor.role !== "owner")
    return { ok: false, reason: "Only the space's owner can remove people." };
  return {
    ok: true,
    events: [{ type: "member.removed", actorId, commandId: null, at, payload: { userId } }],
  };
}
