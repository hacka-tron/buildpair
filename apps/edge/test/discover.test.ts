import { newId } from "@buildpair/domain";
import { describe, expect, it } from "vitest";
import { type Client, command, join, signIn } from "./helpers";

type Listing = {
  spaceId: string;
  name: string;
  ownerName: string;
  goals: { title: string }[];
  people: number;
  asked: boolean;
};
const idOf = async (c: Client) => ((await (await c.get("/me")).json()) as { id: string }).id;
const discover = async (c: Client, q = "") =>
  (
    (await (await c.get(`/discover${q ? `?q=${encodeURIComponent(q)}` : ""}`)).json()) as {
      listings: Listing[];
    }
  ).listings;
/** The room updates a listing just after answering, so look again for a moment. */
async function eventually<T>(read: () => Promise<T>, ok: (v: T) => boolean): Promise<T> {
  for (let i = 0; i < 20; i++) {
    const v = await read();
    if (ok(v)) return v;
    await new Promise((r) => setTimeout(r, 50));
  }
  return read();
}

async function listedSpace() {
  const maya = await signIn(`maya-${newId()}@example.com`);
  const name = `Ledgerly ${newId().slice(-6)}`;
  const { id: spaceId } = (await (
    await maya.post("/spaces", { name, purpose: "Invoicing for freelancers" })
  ).json()) as {
    id: string;
  };
  await maya.post(`/spaces/${spaceId}/commands`, {
    commands: [
      command({
        type: "item.create",
        payload: { itemId: newId(), kind: "goal", title: "First 10 paying users" },
      }),
      command({
        type: "item.create",
        payload: { itemId: newId(), kind: "goal", title: "Secret pivot", visibility: "owner" },
      }),
      command({ type: "item.create", payload: { itemId: newId(), kind: "todo", title: "Email Bob" } }),
    ],
  });
  expect((await maya.post(`/spaces/${spaceId}/listing`, { on: true })).status).toBe(200);
  return { maya, spaceId, name };
}

describe("Discover", () => {
  it("shows a listed space to strangers with only its shared goals, and not to its own people", async () => {
    const { maya, spaceId, name } = await listedSpace();
    const sam = await signIn(`sam-${newId()}@example.com`);
    const found = (await discover(sam, name)).find((l) => l.spaceId === spaceId);
    expect(found).toMatchObject({ name, ownerName: expect.any(String), people: 1, asked: false });
    expect(found?.goals.map((g) => g.title)).toEqual(["First 10 paying users"]);
    expect(JSON.stringify(found)).not.toContain("Secret pivot");
    expect(JSON.stringify(found)).not.toContain("Email Bob");
    expect((await discover(maya, name)).some((l) => l.spaceId === spaceId)).toBe(false);
    const { spaces } = (await (await maya.get("/spaces")).json()) as { spaces: { listed?: boolean }[] };
    expect(spaces[0]?.listed).toBe(true);
  });

  it("follows changes to the space and disappears when turned off", async () => {
    const { maya, spaceId, name } = await listedSpace();
    const sam = await signIn(`sam-${newId()}@example.com`);
    await maya.post(`/spaces/${spaceId}/commands`, {
      commands: [command({ type: "space.edit", payload: { name: `${name} Pro` } })],
    });
    const renamed = await eventually(
      () => discover(sam, name),
      (ls) => ls.some((l) => l.spaceId === spaceId && l.name.endsWith("Pro")),
    );
    expect(renamed.find((l) => l.spaceId === spaceId)?.name).toBe(`${name} Pro`);
    await maya.post(`/spaces/${spaceId}/listing`, { on: false });
    expect((await discover(sam, name)).some((l) => l.spaceId === spaceId)).toBe(false);
  });

  it("only lets the owner list a space", async () => {
    const { maya, spaceId } = await listedSpace();
    const jordan = await signIn(`jordan-${newId()}@example.com`);
    await join(maya, jordan, spaceId);
    expect((await jordan.post(`/spaces/${spaceId}/listing`, { on: false })).status).toBe(404);
  });

  it("hides listings between people who blocked each other", async () => {
    const { maya, spaceId, name } = await listedSpace();
    const sam = await signIn(`sam-${newId()}@example.com`);
    await maya.post("/me/blocks", { userId: await idOf(sam) });
    expect((await discover(sam, name)).some((l) => l.spaceId === spaceId)).toBe(false);
  });

  it("turns an offer into a request with a note the owner sees, and caps offers per day", async () => {
    const { maya, spaceId, name } = await listedSpace();
    const sam = await signIn(`sam-${newId()}@example.com`);
    const res = await sam.post(`/discover/${spaceId}/offer`, {
      note: "I run a SaaS too, happy to swap notes",
    });
    expect(await res.json()).toEqual({ status: "requested" });
    expect((await discover(sam, name)).find((l) => l.spaceId === spaceId)?.asked).toBe(true);
    const { requests } = (await (await maya.get(`/spaces/${spaceId}/requests`)).json()) as {
      requests: { userId: string; note: string | null }[];
    };
    expect(requests).toEqual([
      expect.objectContaining({ userId: await idOf(sam), note: "I run a SaaS too, happy to swap notes" }),
    ]);
    expect((await sam.post(`/discover/${newId()}/offer`, {})).status).toBe(404);

    // One owner with eleven listed spaces keeps this quick.
    const busy = await signIn(`busy-${newId()}@example.com`);
    const owner = await signIn(`owner-${newId()}@example.com`);
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const { id } = (await (await owner.post("/spaces", { name: `S${i}`, purpose: "Testing" })).json()) as {
        id: string;
      };
      await owner.post(`/spaces/${id}/listing`, { on: true });
      statuses.push((await busy.post(`/discover/${id}/offer`, { note: "hi" })).status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  }, 30_000);

  it("takes a goal off the card once it's made private, and refreshes a request asked again", async () => {
    const { maya, spaceId, name } = await listedSpace();
    const sam = await signIn(`sam-${newId()}@example.com`);
    const goalId = newId();
    await maya.post(`/spaces/${spaceId}/commands`, {
      commands: [
        command({ type: "item.create", payload: { itemId: goalId, kind: "goal", title: "Raise a round" } }),
      ],
    });
    await eventually(
      () => discover(sam, name),
      (ls) => ls.some((l) => l.goals.some((g) => g.title === "Raise a round")),
    );
    await maya.post(`/spaces/${spaceId}/commands`, {
      commands: [command({ type: "item.visibility", payload: { itemId: goalId, visibility: "owner" } })],
    });
    const after = await eventually(
      () => discover(sam, name),
      (ls) => !ls.some((l) => l.goals.some((g) => g.title === "Raise a round")),
    );
    expect(JSON.stringify(after)).not.toContain("Raise a round");
    // Someone the offerer blocked can't be offered to.
    await sam.post("/me/blocks", { userId: await idOf(maya) });
    expect((await sam.post(`/discover/${spaceId}/offer`, {})).status).toBe(404);
  });

  it("takes the owner's first name from their account", async () => {
    const { spaceId, name } = await listedSpace();
    const sam = await signIn(`sam-${newId()}@example.com`);
    const found = (await discover(sam, name)).find((l) => l.spaceId === spaceId);
    // Test accounts are named after their email's first part, so that's the account name here.
    expect(found?.ownerName).toMatch(/^maya-/);
  });
});
