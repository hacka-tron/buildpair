import type { SpaceState } from "@buildpair/domain";
import { useEffect, useSyncExternalStore } from "react";
import { kvStorage } from "./storage";

/** spaceId -> the last message position this person has seen on this device. */
let read: Record<string, number> = {};
let owner = "";
/** Saved positions have loaded for `owner`; until then nothing starts counting. */
let ready = false;
const listeners = new Set<() => void>();
const key = (userId: string) => `read:${userId}`;

function emit() {
  read = { ...read };
  for (const l of listeners) l();
}

async function load(userId: string) {
  if (owner === userId) return;
  owner = userId;
  ready = false;
  read = {};
  try {
    const saved = await kvStorage.get(key(userId));
    // What was saved wins over anything marked while it loaded, unless the mark is newer.
    if (saved && owner === userId) {
      const stored = JSON.parse(saved) as Record<string, number>;
      for (const [id, seq] of Object.entries(stored)) read[id] = Math.max(seq, read[id] ?? -1);
    }
  } catch {
    // A damaged value: start fresh.
  }
  if (owner === userId) ready = true;
  emit();
}

function save() {
  if (owner) void kvStorage.set(key(owner), JSON.stringify(read));
}

/** The newest message position in a space that someone else wrote (blocked people don't count). */
export function latestFromOthers(
  view: SpaceState | undefined,
  userId: string,
  blocked: ReadonlySet<string>,
): number {
  if (!view) return 0;
  for (let i = view.messages.length - 1; i >= 0; i--) {
    const m = view.messages[i]!;
    if (m.authorId !== userId && !blocked.has(m.authorId)) return m.seq;
  }
  return 0;
}

/**
 * Whether a space has something new. A space this device has never read starts as read up to now, so
 * old history doesn't light up every space at once.
 */
export function isUnread(
  lastRead: number | undefined,
  view: SpaceState | undefined,
  userId: string,
  blocked: ReadonlySet<string>,
): boolean {
  if (lastRead === undefined) return false;
  return latestFromOthers(view, userId, blocked) > lastRead;
}

/** Remember that this person has seen a space up to `seq`. */
export function markRead(spaceId: string, seq: number) {
  if ((read[spaceId] ?? -1) >= seq) return;
  read[spaceId] = seq;
  emit();
  save();
}

/** Start counting from now for spaces this device hasn't read yet. */
export function startReading(spaceId: string, seq: number) {
  if (read[spaceId] !== undefined || !owner || !ready) return;
  read[spaceId] = seq;
  emit();
  save();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useReadPositions(userId: string): Record<string, number> {
  useEffect(() => {
    if (userId) void load(userId);
  }, [userId]);
  return useSyncExternalStore(
    subscribe,
    () => read,
    () => read,
  );
}

/** Which of these spaces have something new. Spaces seen for the first time start as read. */
export function useUnread(
  ids: readonly string[],
  views: Record<string, SpaceState | undefined>,
  userId: string,
  blocked: ReadonlySet<string>,
): ReadonlySet<string> {
  const positions = useReadPositions(userId);
  useEffect(() => {
    if (owner !== userId || !ready) return;
    for (const id of ids) {
      const v = views[id];
      if (v && v.seq > 0 && positions[id] === undefined)
        startReading(id, latestFromOthers(v, userId, blocked));
    }
  }, [ids, views, userId, blocked, positions]);
  return new Set(ids.filter((id) => isUnread(positions[id], views[id], userId, blocked)));
}
