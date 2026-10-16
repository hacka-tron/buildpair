import type { PersistedSpace, SpaceStorage } from "@buildpair/sync";

const DB = "buildpair";
const STORE = "spaces";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** The device's copy of each space, in IndexedDB (web). Falls back to nothing in private windows. */
export const spaceStorage: SpaceStorage = {
  async load(spaceId) {
    try {
      return ((await run("readonly", (s) => s.get(spaceId))) as PersistedSpace | undefined) ?? null;
    } catch {
      return null;
    }
  },
  async save(spaceId, data) {
    try {
      await run("readwrite", (s) => s.put(data, spaceId));
    } catch {
      // Storage unavailable (private browsing); the app still works online.
    }
  },
};

/** Small values kept on the device (read positions). Missing in private windows, which is fine. */
export const kvStorage = {
  async get(key: string): Promise<string | null> {
    try {
      return localStorage.getItem(`buildpair:${key}`);
    } catch {
      return null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    try {
      localStorage.setItem(`buildpair:${key}`, value);
    } catch {
      // Storage full or blocked: read positions just won't survive a reload.
    }
  },
};
