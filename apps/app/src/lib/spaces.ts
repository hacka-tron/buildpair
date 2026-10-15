import type { SpaceState } from "@buildpair/domain";
import type { Change } from "@buildpair/sync";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { createSpace, listSpaces, type SpaceSummary } from "./api";
import { authClient } from "./auth";
import { getSync, stopAllSyncs } from "./use-space";

/** The signed-in person's spaces, shared by the sidebar, the Spaces tab and Today. */
let spaces: SpaceSummary[] | null = null;
let error = "";
/** Spaces that were deleted (or that you were removed from) since the list loaded. */
let gone: string[] = [];
let loading: Promise<void> | null = null;
/** Whose spaces these are, and a counter that makes answers for an earlier person get ignored. */
let owner = "";
let generation = 0;
const listeners = new Set<() => void>();
let snapshot: { spaces: SpaceSummary[] | null; error: string; gone: string[] } = { spaces, error, gone };

function emit() {
  snapshot = { spaces, error, gone };
  for (const l of listeners) l();
}

export function refreshSpaces(): Promise<void> {
  if (loading) return loading;
  const mine = generation;
  const request = listSpaces()
    .then((res) => {
      if (mine !== generation) return;
      spaces = res.spaces;
      error = "";
    })
    .catch((e: Error) => {
      if (mine !== generation) return;
      error = e.message;
    })
    .finally(() => {
      if (loading === request) loading = null;
      emit();
    });
  loading = request;
  return request;
}

export async function addSpace(name: string, purpose: string): Promise<SpaceSummary> {
  const created = await createSpace(name, purpose);
  spaces = [created, ...(spaces ?? []).filter((s) => s.id !== created.id)];
  emit();
  return created;
}

/** Update one space in the list at once (after its owner renames or recolors it). */
export function patchSpace(id: string, patch: Partial<Pick<SpaceSummary, "name" | "purpose" | "color">>) {
  if (!spaces) return;
  spaces = spaces.map((s) => (s.id === id ? { ...s, ...patch } : s));
  emit();
}

/** The server says this space is gone: drop it from the list so nothing keeps syncing it. */
export function markSpaceGone(id: string) {
  if (gone.includes(id)) return;
  gone = [...gone, id];
  if (spaces) spaces = spaces.filter((s) => s.id !== id);
  emit();
}

/** One space's summary from the list, or undefined while it loads. */
export function useSpaceSummary(id: string): SpaceSummary | undefined {
  const snap = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  );
  return snap.spaces?.find((s) => s.id === id);
}

/** Forget everything on sign-out so the next person starts clean. */
export function resetSpaces() {
  clear();
  emit();
}

function clear() {
  generation += 1;
  loading = null;
  owner = "";
  spaces = null;
  error = "";
  gone = [];
  snapshot = { spaces, error, gone };
}

/** Called with the signed-in person's ID; a different person (or none) starts from nothing. */
function ensureOwner(userId: string) {
  if (owner === userId) return;
  // Runs during render, so it clears quietly; every reader picks up the new snapshot as it renders.
  if (owner) {
    stopAllSyncs();
    clear();
  }
  owner = userId;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useSpaces() {
  const { data: session } = authClient.useSession();
  const userId = session?.user.id ?? "";
  if (userId) ensureOwner(userId);
  const snap = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  );
  useEffect(() => {
    if (userId && spaces === null) void refreshSpaces();
  }, [userId]);
  return snap;
}

/** Live state of several spaces at once (for Today and the Spaces list), keyed by space ID. */
export function useSpaceViews(ids: readonly string[], userId: string): Record<string, SpaceState> {
  const key = ids.join(",");
  const store = useMemo(() => {
    // getSync starts a space's sync the first time it's asked for; it's cached, so a discarded render
    // costs nothing more than an early start.
    const syncs = userId
      ? key
          .split(",")
          .filter(Boolean)
          .map((id) => getSync(id, userId))
      : [];
    let cached: Record<string, SpaceState> = {};
    let cachedFrom: unknown[] = [];
    return {
      subscribe: (l: () => void) => {
        const offs = syncs.map((s) => s.subscribe(l));
        return () => {
          for (const off of offs) off();
        };
      },
      get: () => {
        const views = syncs.map((s) => s.getSnapshot().view);
        if (views.length !== cachedFrom.length || views.some((v, i) => v !== cachedFrom[i])) {
          cachedFrom = views;
          cached = Object.fromEntries(syncs.map((s, i) => [s.spaceId, views[i]!]));
        }
        return cached;
      },
    };
  }, [key, userId]);
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

/**
 * Applies a change to a space, unless this device hasn't loaded the space yet or the rules refuse it.
 * Returns why it didn't happen, or null when it did.
 */
export function applyChange(spaceId: string, userId: string, change: Change): string | null {
  const sync = getSync(spaceId, userId);
  if (!sync.getSnapshot().view.members[userId]) return "Still loading that space. Try again in a moment.";
  const result = sync.dispatch(change);
  return result.ok ? null : result.reason;
}
