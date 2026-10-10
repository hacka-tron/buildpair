import { SpaceSync } from "@buildpair/sync";
import { useState, useSyncExternalStore } from "react";
import { spaceStorage } from "./storage";
import { spaceTransport } from "./transport";

const syncs = new Map<string, SpaceSync>();

/** One SpaceSync per space per signed-in person, kept for the app's lifetime so reopening is instant. */
function getSync(spaceId: string, userId: string) {
  const key = `${userId}:${spaceId}`;
  let sync = syncs.get(key);
  if (!sync) {
    sync = new SpaceSync(spaceId, userId, spaceStorage, spaceTransport);
    syncs.set(key, sync);
    void sync.start();
  }
  return sync;
}

export function stopAllSyncs() {
  for (const s of syncs.values()) s.stop();
  syncs.clear();
}

export function useSpace(spaceId: string, userId: string) {
  const [sync] = useState(() => getSync(spaceId, userId));
  const snapshot = useSyncExternalStore(sync.subscribe, sync.getSnapshot, sync.getSnapshot);
  return { sync, ...snapshot };
}
