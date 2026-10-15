import type { SpaceState } from "@buildpair/domain";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { createSpace, listSpaces, type SpaceSummary } from "./api";
import { getSync } from "./use-space";

/** The signed-in person's spaces, shared by the sidebar, the Spaces tab and Today. */
let spaces: SpaceSummary[] | null = null;
let error = "";
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
let snapshot: { spaces: SpaceSummary[] | null; error: string } = { spaces, error };

function emit() {
  snapshot = { spaces, error };
  for (const l of listeners) l();
}

export function refreshSpaces(): Promise<void> {
  loading ??= listSpaces()
    .then((res) => {
      spaces = res.spaces;
      error = "";
    })
    .catch((e: Error) => {
      error = e.message;
    })
    .finally(() => {
      loading = null;
      emit();
    });
  return loading;
}

export async function addSpace(name: string, purpose: string): Promise<SpaceSummary> {
  const created = await createSpace(name, purpose);
  spaces = [created, ...(spaces ?? []).filter((s) => s.id !== created.id)];
  emit();
  return created;
}

/** Forget everything on sign-out so the next person starts clean. */
export function resetSpaces() {
  spaces = null;
  error = "";
  emit();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useSpaces() {
  const snap = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  );
  useEffect(() => {
    if (spaces === null) void refreshSpaces();
  }, []);
  return snap;
}

/** Live state of several spaces at once (for Today and the Spaces list), keyed by space ID. */
export function useSpaceViews(ids: readonly string[], userId: string): Record<string, SpaceState> {
  const key = ids.join(",");
  const store = useMemo(() => {
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
