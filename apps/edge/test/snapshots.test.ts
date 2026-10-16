import { env, runInDurableObject } from "cloudflare:test";
import { applyEvents, emptySpace, newId, type SpaceState } from "@buildpair/domain";
import { describe, expect, it } from "vitest";
import type { SpaceRoom } from "../src/space-room";
import { command, join, PASSWORD, signIn } from "./helpers";

type Inside = { state: SpaceState | null; load(): SpaceState; readLog(): Parameters<typeof applyEvents>[1] };

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
    const { woken, replayed } = await wakeAndCompare(spaceId);
    expect(woken).toEqual(replayed);
    expect(JSON.stringify(woken)).not.toContain("jordan says");
  });
});
