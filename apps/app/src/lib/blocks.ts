import { useEffect, useSyncExternalStore } from "react";
import { blockPerson, listBlocks, unblockPerson } from "./api";

/** People the signed-in person has blocked. Their messages and reactions are hidden everywhere. */
let blocked: ReadonlySet<string> = new Set();
let loaded = false;
const listeners = new Set<() => void>();

function set(next: ReadonlySet<string>) {
  blocked = next;
  for (const l of listeners) l();
}

export async function refreshBlocks(): Promise<void> {
  const { blocks } = await listBlocks();
  loaded = true;
  set(new Set(blocks.map((b) => b.userId)));
}

export async function block(userId: string): Promise<void> {
  await blockPerson(userId);
  set(new Set([...blocked, userId]));
}

export async function unblock(userId: string): Promise<void> {
  await unblockPerson(userId);
  set(new Set([...blocked].filter((id) => id !== userId)));
}

/** Forget everything when someone signs out. */
export function resetBlocks() {
  loaded = false;
  set(new Set());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useBlocked(): ReadonlySet<string> {
  const snap = useSyncExternalStore(
    subscribe,
    () => blocked,
    () => blocked,
  );
  useEffect(() => {
    if (!loaded) void refreshBlocks().catch(() => undefined);
  }, []);
  return snap;
}
