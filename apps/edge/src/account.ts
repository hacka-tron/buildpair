import { and, eq, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { invites, joinRequests, memberships, spaces } from "./db/schema";
import type { Env } from "./env";

/**
 * Removes everything a person made, just before their account row is deleted (which also removes their
 * sessions, sign-in methods and memberships). Spaces they own are deleted for everyone in them. In other
 * people's spaces their items, messages and reactions are removed. Each step is safe to repeat, so if one
 * fails the account stays and deleting again finishes the job.
 */
export async function eraseAccount(env: Env, userId: string): Promise<void> {
  const db = drizzle(env.DB);
  const room = (id: string) => env.SPACE_ROOM.get(env.SPACE_ROOM.idFromName(id));
  // First, so an owner approving one of their requests right now can tell and undo the join.
  await db.delete(joinRequests).where(eq(joinRequests.userId, userId));
  const joined = await db
    .select({ spaceId: memberships.spaceId })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), ne(memberships.role, "owner")))
    .all();
  for (const { spaceId } of joined) await room(spaceId).eraseMember(userId);

  const owned = await db.select({ id: spaces.id }).from(spaces).where(eq(spaces.ownerId, userId)).all();
  for (const { id } of owned) {
    // Closing the room's connections makes other members' devices find out it's gone.
    await room(id).destroy();
    // Its memberships and invites go with it.
    await db.delete(spaces).where(eq(spaces.id, id));
  }
  // Invite links they made for other people's spaces stop working too.
  await db.delete(invites).where(eq(invites.createdBy, userId));
}
