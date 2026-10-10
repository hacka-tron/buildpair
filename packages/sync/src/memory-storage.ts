import type { PersistedSpace, SpaceStorage } from "./types";

/** In-memory storage for tests and for the first launch before a real store is ready. */
export class MemoryStorage implements SpaceStorage {
  readonly data = new Map<string, PersistedSpace>();
  async load(spaceId: string) {
    const d = this.data.get(spaceId);
    return d ? structuredClone(d) : null;
  }
  async save(spaceId: string, data: PersistedSpace) {
    this.data.set(spaceId, structuredClone(data));
  }
}
