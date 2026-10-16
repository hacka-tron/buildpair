import { newId } from "@buildpair/domain";
import { describe, expect, it } from "vitest";
import { type Client, command, join, signIn } from "./helpers";

type Profile = {
  name: string;
  stats: { supporting: number; supportedBy: number; goalsFinished: number };
  badges: string[];
  compliments: { tag: string; count: number }[];
  mine: string[];
};
const idOf = async (c: Client) => ((await (await c.get("/me")).json()) as { id: string }).id;
const profile = async (viewer: Client, userId: string) =>
  (await viewer.get(`/people/${userId}`)).json() as Promise<Profile>;

async function pair() {
  const maya = await signIn(`maya-${newId()}@example.com`);
  const jordan = await signIn(`jordan-${newId()}@example.com`);
  const { id: spaceId } = (await (
    await maya.post("/spaces", { name: "Life", purpose: "Family" })
  ).json()) as {
    id: string;
  };
  await join(maya, jordan, spaceId);
  return { maya, jordan, spaceId, mayaId: await idOf(maya), jordanId: await idOf(jordan) };
}

describe("profiles", () => {
  it("shows stats to people who share a space, and to no one else", async () => {
    const { maya, jordan, spaceId, mayaId, jordanId } = await pair();
    const goalId = newId();
    await maya.post(`/spaces/${spaceId}/commands`, {
      commands: [
        command({ type: "item.create", payload: { itemId: goalId, kind: "goal", title: "Launch" } }),
        command({ type: "item.complete", payload: { itemId: goalId, on: "2026-10-16" } }),
      ],
    });
    let seen = await profile(jordan, mayaId);
    for (let i = 0; i < 20 && seen.stats.goalsFinished === 0; i++) {
      await new Promise((r) => setTimeout(r, 50));
      seen = await profile(jordan, mayaId);
    }
    expect(seen.stats).toEqual({ supporting: 0, supportedBy: 1, goalsFinished: 1 });
    expect((await profile(maya, jordanId)).stats).toMatchObject({ supporting: 1, supportedBy: 0 });
    const stranger = await signIn(`sam-${newId()}@example.com`);
    expect((await stranger.get(`/people/${mayaId}`)).status).toBe(404);
    expect((await maya.get(`/people/${mayaId}`)).status).toBe(200);
  });

  it("lets people who share a space give and take back compliments, once each", async () => {
    const { maya, jordan, mayaId, jordanId } = await pair();
    expect(
      (await jordan.post(`/people/${mayaId}/compliments`, { tag: "keeps_me_going", on: true })).status,
    ).toBe(200);
    await jordan.post(`/people/${mayaId}/compliments`, { tag: "keeps_me_going", on: true });
    let seen = await profile(jordan, mayaId);
    expect(seen.compliments).toEqual([{ tag: "keeps_me_going", count: 1 }]);
    expect(seen.mine).toEqual(["keeps_me_going"]);
    expect((await profile(maya, mayaId)).mine).toEqual([]);
    await jordan.post(`/people/${mayaId}/compliments`, { tag: "keeps_me_going", on: false });
    seen = await profile(jordan, mayaId);
    expect(seen.compliments).toEqual([]);
    expect((await maya.post(`/people/${mayaId}/compliments`, { tag: "friendly", on: true })).status).toBe(
      400,
    );
    expect((await maya.post(`/people/${jordanId}/compliments`, { tag: "rude", on: true })).status).toBe(400);
    const stranger = await signIn(`sam-${newId()}@example.com`);
    expect((await stranger.post(`/people/${mayaId}/compliments`, { tag: "friendly", on: true })).status).toBe(
      404,
    );
  });

  it("hides profiles both ways once someone blocks, clears compliments, and skips private goals", async () => {
    const { maya, jordan, spaceId, mayaId, jordanId } = await pair();
    await jordan.post(`/people/${mayaId}/compliments`, { tag: "friendly", on: true });
    const privateGoal = newId();
    await maya.post(`/spaces/${spaceId}/commands`, {
      commands: [
        command({
          type: "item.create",
          payload: { itemId: privateGoal, kind: "goal", title: "x", visibility: "owner" },
        }),
        command({ type: "item.complete", payload: { itemId: privateGoal, on: "2026-10-16" } }),
      ],
    });
    await new Promise((r) => setTimeout(r, 200));
    expect((await profile(jordan, mayaId)).stats.goalsFinished).toBe(0);
    await maya.post("/me/blocks", { userId: jordanId });
    expect((await jordan.get(`/people/${mayaId}`)).status).toBe(404);
    expect((await maya.get(`/people/${jordanId}`)).status).toBe(404);
    expect((await jordan.post(`/people/${mayaId}/compliments`, { tag: "honest", on: true })).status).toBe(
      404,
    );
    expect((await profile(maya, mayaId)).compliments).toEqual([]);
  });
});
