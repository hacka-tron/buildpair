import type { SpaceState } from "@buildpair/domain";
import type { InboxClientMessage, ReadPositions } from "@buildpair/protocol";
import { useEffect, useSyncExternalStore } from "react";
import { kvStorage } from "./storage";

/**
 * spaceId -> the last message position this person has seen. Saved on the device, and shared with their
 * other devices through the inbox socket (their UserHub keeps the furthest position for each space).
 */
let read: Record<string, number> = {};
let owner = "";
/** Saved positions have loaded for `owner`; until then nothing starts counting. */
let ready = false;
/** The server's positions have arrived, so a space with none there really is new to this person. */
let synced = false;
/** Positions read here that the server hasn't been told about yet. Saved too, so a restart keeps them. */
let unsent: ReadPositions = {};
/** The hub takes this many positions per message. */
const CHUNK = 200;
let sender: ((msg: InboxClientMessage) => boolean) | null = null;
const listeners = new Set<() => void>();
const key = (userId: string) => `read:${userId}`;
const unsentKey = (userId: string) => `read-unsent:${userId}`;

function emit() {
  read = { ...read };
  for (const l of listeners) l();
}

async function load(userId: string) {
  if (owner === userId) return;
  owner = userId;
  ready = false;
  synced = false;
  read = {};
  unsent = {};
  sender = null;
  // What was saved wins over anything marked while it loaded, unless the mark is newer.
  const restore = async (k: string, into: Record<string, number>) => {
    try {
      const saved = await kvStorage.get(k);
      if (!saved || owner !== userId) return;
      for (const [id, seq] of Object.entries(JSON.parse(saved) as Record<string, number>))
        into[id] = Math.max(seq, into[id] ?? -1);
    } catch {
      // A damaged value: start fresh.
    }
  };
  await restore(key(userId), read);
  await restore(unsentKey(userId), unsent);
  if (owner !== userId) return;
  ready = true;
  // Keep anything that arrived while loading, and send what an earlier run couldn't.
  save();
  flush();
  emit();
}

/** Nothing is written until the saved copy has loaded, so a half-empty copy can't replace it. */
function save() {
  if (!owner || !ready) return;
  void kvStorage.set(key(owner), JSON.stringify(read));
  void kvStorage.set(unsentKey(owner), JSON.stringify(unsent));
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

/** Remember that this person has seen a space up to `seq`, here and on their other devices. */
export function markRead(spaceId: string, seq: number) {
  if ((read[spaceId] ?? -1) >= seq) return;
  read[spaceId] = seq;
  unsent[spaceId] = seq;
  emit();
  save();
  flush();
}

/** Send what's waiting, a chunk at a time. Whatever doesn't go waits for the next open. */
function flush(all = false) {
  const before = Object.keys(unsent).length;
  while (sender) {
    const batch = Object.entries(unsent).slice(0, CHUNK);
    if (batch.length === 0 && !all) break;
    if (!sender({ t: "read", reads: Object.fromEntries(batch), ...(all ? { all } : {}) })) break;
    for (const [id, seq] of batch) if (unsent[id] === seq) delete unsent[id];
    all = false;
  }
  if (Object.keys(unsent).length !== before) save();
}

/**
 * The inbox socket opened: send what was read while it was closed, and ask for every saved position.
 * Only positions this person actually read are sent, never the "start from now" ones below, so a new
 * device can't clear a dot another device still shows.
 */
export function connectReads(userId: string, send: (msg: InboxClientMessage) => boolean) {
  void load(userId);
  sender = send;
  flush(true);
}

/** Positions from the server (all of them, or what another device just read). The furthest wins. */
export function mergeReads(userId: string, reads: ReadPositions, all = false) {
  void load(userId);
  let changed = false;
  for (const [id, seq] of Object.entries(reads))
    if ((read[id] ?? -1) < seq) {
      read[id] = seq;
      changed = true;
    }
  if (all) synced = true;
  if (changed) save();
  emit();
}

/** Start counting from now for spaces this person hasn't read anywhere yet. */
export function startReading(spaceId: string, seq: number) {
  if (read[spaceId] !== undefined || !owner || !ready || !synced) return;
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
    if (owner !== userId || !ready || !synced) return;
    for (const id of ids) {
      const v = views[id];
      if (v && v.seq > 0 && positions[id] === undefined)
        startReading(id, latestFromOthers(v, userId, blocked));
    }
  }, [ids, views, userId, blocked, positions]);
  return new Set(ids.filter((id) => isUnread(positions[id], views[id], userId, blocked)));
}
