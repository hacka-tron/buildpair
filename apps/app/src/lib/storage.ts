import type { PersistedSpace, SpaceStorage } from "@buildpair/sync";
import { openDatabaseSync, type SQLiteDatabase } from "expo-sqlite";

let db: SQLiteDatabase | null = null;
function database() {
  if (!db) {
    db = openDatabaseSync("buildpair.db");
    db.execSync("CREATE TABLE IF NOT EXISTS spaces (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL)");
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
