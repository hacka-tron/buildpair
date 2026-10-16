import type { PersistedSpace, SpaceStorage } from "@buildpair/sync";
import { openDatabaseSync, type SQLiteDatabase } from "expo-sqlite";

let db: SQLiteDatabase | null = null;
function database() {
  if (!db) {
    db = openDatabaseSync("buildpair.db");
    db.execSync("CREATE TABLE IF NOT EXISTS spaces (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL)");
    db.execSync("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)");
  }
  return db;
}

/** The device's copy of each space, in SQLite (phones). */
export const spaceStorage: SpaceStorage = {
  async load(spaceId) {
    const row = await database().getFirstAsync<{ data: string }>(
      "SELECT data FROM spaces WHERE id = ?",
      spaceId,
    );
    return row ? (JSON.parse(row.data) as PersistedSpace) : null;
  },
  async save(spaceId, data) {
    await database().runAsync(
      "INSERT OR REPLACE INTO spaces (id, data) VALUES (?, ?)",
      spaceId,
      JSON.stringify(data),
    );
  },
};

/** Small values kept on the device (read positions). */
export const kvStorage = {
  async get(key: string): Promise<string | null> {
    const row = await database().getFirstAsync<{ value: string }>("SELECT value FROM kv WHERE key = ?", key);
    return row?.value ?? null;
  },
  async set(key: string, value: string): Promise<void> {
    await database().runAsync("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)", key, value);
  },
};
