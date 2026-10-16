import { type Message, Reflection } from "@buildpair/protocol";
import type { SpaceState } from "./state";

/** The three parts of a reflection message, or null if it isn't one (or can't be read). */
export function readReflection(message: Message): Reflection | null {
  if (message.kind !== "reflection") return null;
  try {
    const parsed = Reflection.safeParse(JSON.parse(message.body));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const DAY = 86_400_000;

/**
 * Whether to ask this person for a weekly reflection in a space: it's Friday through Monday, they own it,
 * something of theirs is shared and open, and they haven't reflected there in the last six days.
 */
export function reflectionDue(state: SpaceState, userId: string, now: Date): boolean {
  if (state.members[userId]?.role !== "owner") return false;
  const day = now.getDay();
  if (day !== 5 && day !== 6 && day !== 0 && day !== 1) return false;
  const working = Object.values(state.items).some(
    (i) => i.ownerId === userId && i.status === "open" && i.visibility === "space",
  );
  if (!working) return false;
  return !state.messages.some(
    (m) =>
      m.kind === "reflection" && m.authorId === userId && now.getTime() - Date.parse(m.createdAt) < 6 * DAY,
  );
}
