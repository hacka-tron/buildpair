import { SpaceSync } from "@buildpair/sync";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { spaceStorage } from "./storage";
import { connectInbox, setLive, spaceTransport } from "./transport";

const syncs = new Map<string, SpaceSync>();

/** One SpaceSync per space per signed-in person, kept for the app's lifetime so reopening is instant. */
export function getSync(spaceId: string, userId: string) {
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
  stopInbox?.();
  stopInbox = null;
}

let stopInbox: (() => void) | null = null;

/** Listen for news from every space through the person's inbox, while they're signed in. */
export function useInbox(userId: string) {
  useEffect(() => {
    if (!userId) return;
    const forSpace = (spaceId: string) => syncs.get(`${userId}:${spaceId}`);
    stopInbox?.();
    const stop = connectInbox({
      onPoke: (spaceId, seq) => forSpace(spaceId)?.catchUp(seq),
      onOpen: () => {
        for (const [key, s] of syncs) if (key.startsWith(`${userId}:`)) s.catchUp();
      },
    });
    stopInbox = stop;
    return () => {
      stop();
      if (stopInbox === stop) stopInbox = null;
    };
  }, [userId]);
}

/** A space on screen: it holds a live socket (presence, typing) until the screen closes. */
export function useSpace(spaceId: string, userId: string) {
  const sync = useMemo(() => getSync(spaceId, userId), [spaceId, userId]);
  useEffect(() => {
    setLive(spaceId, true);
    return () => setLive(spaceId, false);
  }, [spaceId]);
  const snapshot = useSyncExternalStore(sync.subscribe, sync.getSnapshot, sync.getSnapshot);
  return { sync, ...snapshot };
}
