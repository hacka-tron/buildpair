import { env, runInDurableObject } from "cloudflare:test";
import { applyEvents, emptySpace, newId, type SpaceState } from "@buildpair/domain";
import { describe, expect, it } from "vitest";
import type { SpaceRoom } from "../src/space-room";
import { command, join, PASSWORD, signIn } from "./helpers";

type Inside = { state: SpaceState | null; load(): SpaceState; readLog(): Parameters<typeof applyEvents>[1] };

async function snapshotRows(spaceId: string): Promise<number> {
  const stub = env.SPACE_ROOM.get(env.SPACE_ROOM.idFromName(spaceId));
  return runInDurableObject(
    stub,
    async (_room: SpaceRoom, state) =>
      state.storage.sql.exec<{ n: number }>("SELECT count(*) AS n FROM snapshot").toArray()[0]!.n,
  );
}

/** Forget the room's in-memory state, wake it again (from its snapshot), and compare with a full replay. */
async function wakeAndCompare(spaceId: string) {
  const stub = env.SPACE_ROOM.get(env.SPACE_ROOM.idFromName(spaceId));
  return runInDurableObject(stub, async (room: SpaceRoom, state) => {
    const inside = room as unknown as Inside;
    inside.state = null;
    const woken = inside.load();
    const replayed = applyEvents(emptySpace(), inside.readLog());
    const snap = state.storage.sql.exec<{ seq: number }>("SELECT seq FROM snapshot").toArray()[0];
    return { woken, replayed, snapSeq: snap?.seq ?? 0 };
  });
}

describe("snapshots", () => {
  it("wakes up from a snapshot to the same state as replaying the whole log", async () => {
    const maya = await signIn(`maya-${newId()}@example.com`);
    const { id: spaceId } = (await (
      await maya.post("/spaces", { name: "Life", purpose: "Family" })
    ).json()) as {
      id: string;
    };
    const itemId = newId();
    await maya.post(`/spaces/${spaceId}/commands`, {
      commands: [
        command({ type: "item.create", payload: { itemId, kind: "todo", title: "Rent" } }),
        ...Array.from({ length: 8 }, (_, i) =>
          command({ type: "message.send", payload: { messageId: newId(), body: `m${i}` } }),
        ),
        command({ type: "item.complete", payload: { itemId, on: "2026-10-16" } }),
      ],
    });
    const { woken, replayed, snapSeq } = await wakeAndCompare(spaceId);
    expect(snapSeq).toBeGreaterThan(0);
    expect(woken).toEqual(replayed);
    expect(woken.items[itemId]?.status).toBe("done");
  });

  it("never brings back someone erased after a snapshot was taken", async () => {
    const maya = await signIn(`maya-${newId()}@example.com`);
    const jordan = await signIn(`jordan-${newId()}@example.com`);
    const { id: spaceId } = (await (
      await maya.post("/spaces", { name: "Life", purpose: "Family" })
    ).json()) as {
      id: string;
    };
    await join(maya, jordan, spaceId);
    await jordan.post(`/spaces/${spaceId}/commands`, {
      commands: Array.from({ length: 6 }, (_, i) =>
        command({ type: "message.send", payload: { messageId: newId(), body: `jordan says ${i}` } }),
      ),
    });
    expect((await jordan.post("/api/auth/delete-user", { password: PASSWORD })).status).toBe(200);
    // The erase dropped any snapshot that could still hold copies of their things.
    expect(await snapshotRows(spaceId)).toBe(0);
    const { woken, replayed } = await wakeAndCompare(spaceId);
    expect(woken).toEqual(replayed);
    expect(JSON.stringify(woken)).not.toContain("jordan says");
  });

  it("drops the snapshot when an item moves out or the space is deleted, and ignores one from other rules", async () => {
    const maya = await signIn(`maya-${newId()}@example.com`);
    const make = async (name: string) =>
      ((await (await maya.post("/spaces", { name, purpose: "x" })).json()) as { id: string }).id;
    const home = await make("Home");
    const work = await make("Work");
    const itemId = newId();
    await maya.post(`/spaces/${home}/commands`, {
      commands: [
        command({
          type: "item.create",
          payload: { itemId, kind: "todo", title: "Private one", visibility: "owner" },
        }),
        ...Array.from({ length: 4 }, () =>
          command({ type: "message.send", payload: { messageId: newId(), body: "hi" } }),
        ),
      ],
    });
    expect(await snapshotRows(home)).toBe(1);
    await maya.post(`/spaces/${home}/items/${itemId}/move`, { moveId: newId(), toSpaceId: work });
    expect(await snapshotRows(home)).toBe(0);

    // A snapshot saved under other rules is ignored, not trusted.
    const stub = env.SPACE_ROOM.get(env.SPACE_ROOM.idFromName(work));
    const woken = await runInDurableObject(stub, async (room: SpaceRoom, state) => {
      state.storage.sql.exec(
        "INSERT OR REPLACE INTO snapshot (id, seq, v, data) VALUES (1, 99999, 1, ?)",
        JSON.stringify({ ...emptySpace(), seq: 99999, name: "Bogus" }),
      );
      const inside = room as unknown as Inside;
      inside.state = null;
      return inside.load();
    });
    expect(woken.name).toBe("Work");

    const owner = await signIn(`owner-${newId()}@example.com`);
    const { id: gone } = (await (await owner.post("/spaces", { name: "Gone", purpose: "x" })).json()) as {
      id: string;
    };
    await owner.post(`/spaces/${gone}/commands`, {
      commands: Array.from({ length: 4 }, () =>
        command({ type: "message.send", payload: { messageId: newId(), body: "hi" } }),
      ),
    });
    expect(await snapshotRows(gone)).toBe(1);
    await owner.post("/api/auth/delete-user", { password: PASSWORD });
    expect(await snapshotRows(gone)).toBe(0);
  });
});
