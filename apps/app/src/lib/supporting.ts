import type { SpaceState } from "@buildpair/domain";
import type { Message } from "@buildpair/protocol";
import type { SpaceSummary } from "./api";

const DAY = 86_400_000;
/** A space goes quiet after this many days without a word from its owner. */
export const QUIET_DAYS = 7;

export interface CheckIn {
  spaceId: string;
  spaceName: string;
  ownerName: string;
  quietDays: number;
}

export interface SupportedRow {
  spaceId: string;
  spaceName: string;
  ownerName: string;
  othersCount: number;
  last: Message | undefined;
  lastBy: string;
}

const ownerOf = (view: SpaceState | undefined) =>
  Object.values(view?.members ?? {}).find((m) => m.role === "owner");

/**
 * Spaces you support whose owner has gone quiet: they have something open and shared, and haven't
 * posted, ticked or skipped anything for a week. Shown only to supporters, never to the owner.
 */
export function checkIns(
  spaces: readonly SpaceSummary[],
  views: Record<string, SpaceState | undefined>,
  now = Date.now(),
): CheckIn[] {
  const out: CheckIn[] = [];
  for (const s of spaces) {
    if (s.role !== "supporter") continue;
    const view = views[s.id];
    const owner = ownerOf(view);
    if (!view || !owner) continue;
    const working = Object.values(view.items).some(
      (i) => i.ownerId === owner.userId && i.status === "open" && i.visibility === "space" && !i.parentId,
    );
    if (!working) continue;
    const theirs = view.messages.filter((m) => m.authorId === owner.userId);
    // With nothing said yet, the clock starts when their oldest shared item was added.
    const since =
      theirs.at(-1)?.createdAt ??
      Object.values(view.items)
        .filter((i) => i.ownerId === owner.userId)
        .map((i) => i.createdAt)
        .sort()[0];
    if (!since) continue;
    const quietDays = Math.floor((now - Date.parse(since)) / DAY);
    if (quietDays >= QUIET_DAYS)
      out.push({ spaceId: s.id, spaceName: s.name, ownerName: owner.name, quietDays });
  }
  return out.sort((a, b) => b.quietDays - a.quietDays);
}

/** One row per space someone else shares with you, newest activity first. */
export function supportedRows(
  spaces: readonly SpaceSummary[],
  views: Record<string, SpaceState | undefined>,
  userId: string,
  blocked: ReadonlySet<string> = new Set(),
): SupportedRow[] {
  return spaces
    .filter((s) => s.role === "supporter")
    .map((s) => {
      const view = views[s.id];
      const owner = ownerOf(view);
      const last = view?.messages.filter((m) => !blocked.has(m.authorId)).at(-1);
      return {
        spaceId: s.id,
        spaceName: view?.name || s.name,
        ownerName: owner?.name ?? "",
        othersCount: Math.max(0, Object.keys(view?.members ?? {}).length - 2),
        last,
        lastBy: !last
          ? ""
          : last.authorId === userId
            ? "You"
            : (view?.members[last.authorId]?.name ?? "Someone"),
      };
    })
    .sort((a, b) => (b.last?.createdAt ?? "").localeCompare(a.last?.createdAt ?? ""));
}

export type ActivityEntry =
  | { kind: "requests"; spaceId: string; spaceName: string; count: number }
  | {
      kind: "reactions";
      spaceId: string;
      spaceName: string;
      message: Message;
      /** emoji -> names of the people who reacted (not you). */
      byEmoji: [string, string[]][];
    };

/**
 * What's aimed at you: people asking to join your spaces, and reactions to what you said in the last
 * two weeks (newest messages first).
 */
export function activity(
  spaces: readonly SpaceSummary[],
  views: Record<string, SpaceState | undefined>,
  userId: string,
  blocked: ReadonlySet<string> = new Set(),
  now = Date.now(),
): ActivityEntry[] {
  const requests: ActivityEntry[] = spaces
    .filter((s) => s.role === "owner" && (s.requests ?? 0) > 0)
    .map((s) => ({ kind: "requests", spaceId: s.id, spaceName: s.name, count: s.requests ?? 0 }));
  const reactions: (ActivityEntry & { kind: "reactions" })[] = [];
  for (const s of spaces) {
    const view = views[s.id];
    if (!view) continue;
    for (const m of view.messages) {
      if (m.authorId !== userId || now - Date.parse(m.createdAt) > 14 * DAY) continue;
      const byEmoji = Object.entries(view.reactions[m.id] ?? {})
        .map(
          ([emoji, users]) =>
            [
              emoji,
              users
                .filter((u) => u !== userId && !blocked.has(u))
                .map((u) => view.members[u]?.name ?? "Someone"),
            ] as [string, string[]],
        )
        .filter(([, names]) => names.length > 0);
      if (byEmoji.length)
        reactions.push({
          kind: "reactions",
          spaceId: s.id,
          spaceName: view.name || s.name,
          message: m,
          byEmoji,
        });
    }
  }
  reactions.sort((a, b) => b.message.createdAt.localeCompare(a.message.createdAt));
  return [...requests, ...reactions.slice(0, 50)];
}

/** "Sam", "Sam and Ana", "Sam and 3 others". */
export function namesLine(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]} and ${names.length - 1} others`;
}

export interface Nudge {
  ownerName: string;
  quietDays: number;
  /** Ready-to-edit messages, most specific first. */
  suggestions: string[];
}

/**
 * For a supporter looking at a quiet space: a few check-in messages to start from, built from the
 * owner's last word and what they're working on. Null when there's nothing to nudge about.
 */
export function nudgeFor(view: SpaceState | undefined, userId: string, now = Date.now()): Nudge | null {
  if (!view || view.members[userId]?.role !== "supporter") return null;
  const [quiet] = checkIns(
    [{ id: "x", name: view.name, purpose: view.purpose, role: "supporter" }],
    { x: view },
    now,
  );
  if (!quiet) return null;
  const owner = ownerOf(view)!;
  const first = owner.name.split(" ")[0] || owner.name;
  const working = Object.values(view.items)
    .filter(
      (i) => i.ownerId === owner.userId && i.status === "open" && i.visibility === "space" && !i.parentId,
    )
    .sort((a, b) => (a.kind === "goal" ? -1 : 0) - (b.kind === "goal" ? -1 : 0));
  const focus = working[0]?.title;
  const last = view.messages.filter((m) => m.authorId === owner.userId).at(-1);
  const suggestions: string[] = [];
  if (last?.kind === "skip" && last.body)
    suggestions.push(`Hey ${first}, how are things since "${last.body}"?`);
  if (focus) suggestions.push(`How's ${focus} going? Haven't heard from you in a bit.`);
  suggestions.push(`Anything I can help with this week, ${first}?`);
  if (focus) suggestions.push(`Even 10 minutes on ${focus} today counts. Want to check in after?`);
  return { ownerName: owner.name, quietDays: quiet.quietDays, suggestions: suggestions.slice(0, 3) };
}
