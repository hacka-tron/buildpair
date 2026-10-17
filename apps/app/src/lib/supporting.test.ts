import { applyEvents, emptySpace, type SpaceState } from "@buildpair/domain";
import type { Item, Message, SpaceEvent } from "@buildpair/protocol";
import { describe, expect, it } from "vitest";
import type { SpaceSummary } from "./api";
import { activity, checkIns, namesLine, nudgeFor, supportedRows } from "./supporting";

const NOW = Date.parse("2026-10-16T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();
const ID = (n: number) => `01JZ8Q2V9W3X4Y5Z6A7B8C9D${String(n).padStart(2, "0")}`;

function space(opts: {
  messages?: Partial<Message>[];
  items?: Partial<Item>[];
  reactions?: SpaceState["reactions"];
}) {
  const base: SpaceEvent[] = [
    {
      seq: 1,
      type: "space.created",
      actorId: "alex",
      commandId: null,
      at: daysAgo(30),
      payload: { name: "Running", purpose: "Marathon" },
    },
    {
      seq: 2,
      type: "member.joined",
      actorId: "alex",
      commandId: null,
      at: daysAgo(30),
      payload: { member: { userId: "alex", role: "owner", name: "Alex" } },
    },
    {
      seq: 3,
      type: "member.joined",
      actorId: "me",
      commandId: null,
      at: daysAgo(30),
      payload: { member: { userId: "me", role: "supporter", name: "Me" } },
    },
    {
      seq: 4,
      type: "member.joined",
      actorId: "sam",
      commandId: null,
      at: daysAgo(30),
      payload: { member: { userId: "sam", role: "supporter", name: "Sam" } },
    },
  ];
  const state = applyEvents(emptySpace(), base);
  const items = Object.fromEntries(
    (opts.items ?? []).map((p, i) => {
      const item: Item = {
        id: ID(i),
        kind: "goal",
        title: "Half marathon",
        ownerId: "alex",
        parentId: null,
        visibility: "space",
        status: "open",
        dueOn: null,
        dueTime: null,
        timesPerWeek: null,
        doneOn: [],
        skippedOn: [],
        notes: "",
        createdAt: daysAgo(20),
        ...p,
      };
      return [item.id, item];
    }),
  );
  const messages = (opts.messages ?? []).map((p, i) => ({
    id: ID(50 + i),
    seq: 10 + i,
    authorId: "alex",
    kind: "text" as const,
    body: "hi",
    itemId: null,
    createdAt: daysAgo(1),
    ...p,
  }));
  return { ...state, items, messages, reactions: opts.reactions ?? {} };
}

const supporting: SpaceSummary[] = [{ id: "run", name: "Running", purpose: "Marathon", role: "supporter" }];

describe("checking in", () => {
  it("flags a space whose owner has been quiet a week with something open", () => {
    const view = space({ items: [{}], messages: [{ createdAt: daysAgo(9) }] });
    expect(checkIns(supporting, { run: view }, NOW)).toEqual([
      { spaceId: "run", spaceName: "Running", ownerName: "Alex", quietDays: 9 },
    ]);
  });

  it("leaves out recent, finished, private and owned spaces", () => {
    expect(
      checkIns(supporting, { run: space({ items: [{}], messages: [{ createdAt: daysAgo(2) }] }) }, NOW),
    ).toEqual([]);
    expect(
      checkIns(
        supporting,
        { run: space({ items: [{ status: "done" }], messages: [{ createdAt: daysAgo(20) }] }) },
        NOW,
      ),
    ).toEqual([]);
    expect(checkIns(supporting, { run: space({ items: [{ visibility: "owner" }] }) }, NOW)).toEqual([]);
    const owned: SpaceSummary[] = [{ ...supporting[0]!, role: "owner" }];
    expect(
      checkIns(owned, { run: space({ items: [{}], messages: [{ createdAt: daysAgo(20) }] }) }, NOW),
    ).toEqual([]);
  });

  it("counts from the first item when the owner never said anything", () => {
    expect(
      checkIns(supporting, { run: space({ items: [{ createdAt: daysAgo(8) }] }) }, NOW)[0]?.quietDays,
    ).toBe(8);
  });
});

describe("the supporting list", () => {
  it("shows the last word, skipping blocked people", () => {
    const view = space({
      messages: [
        { authorId: "sam", body: "Go Alex", createdAt: daysAgo(2) },
        { authorId: "pest", body: "spam", createdAt: daysAgo(1) },
      ],
    });
    const [row] = supportedRows(supporting, { run: view }, "me", new Set(["pest"]));
    expect(row).toMatchObject({ spaceName: "Running", ownerName: "Alex", othersCount: 1, lastBy: "Sam" });
    expect(row?.last?.body).toBe("Go Alex");
  });
});

describe("activity", () => {
  it("lists join requests and reactions to what you said lately, without your own or blocked ones", () => {
    const owned: SpaceSummary[] = [{ id: "run", name: "Running", purpose: "", role: "owner", requests: 2 }];
    const mine = ID(50);
    const old = ID(51);
    const view = space({
      messages: [
        { id: mine, authorId: "me", createdAt: daysAgo(1) },
        { id: old, authorId: "me", createdAt: daysAgo(20) },
      ],
      reactions: { [mine]: { "🔥": ["sam", "me", "pest"], "👏": ["me"] }, [old]: { "🔥": ["sam"] } },
    });
    const entries = activity(owned, { run: view }, "me", new Set(["pest"]), NOW);
    expect(entries[0]).toEqual({ kind: "requests", spaceId: "run", spaceName: "Running", count: 2 });
    expect(entries).toHaveLength(2);
    expect(entries[1]).toMatchObject({ kind: "reactions", byEmoji: [["🔥", ["Sam"]]] });
  });

  it("writes names plainly", () => {
    expect(namesLine(["Sam"])).toBe("Sam");
    expect(namesLine(["Sam", "Ana"])).toBe("Sam and Ana");
    expect(namesLine(["Sam", "Ana", "Jo", "Lee"])).toBe("Sam and 3 others");
  });
});

describe("nudges", () => {
  it("offers check-ins built from the owner's last skip and their goal", () => {
    const view = space({
      items: [{ title: "Half marathon" }],
      messages: [{ kind: "skip", body: "knee is sore", createdAt: daysAgo(9) }],
    });
    const nudge = nudgeFor(view, "me", NOW);
    expect(nudge).toMatchObject({ ownerName: "Alex", quietDays: 9 });
    expect(nudge?.suggestions[0]).toContain("knee is sore");
    expect(nudge?.suggestions[1]).toContain("Half marathon");
    expect(nudge?.suggestions).toHaveLength(3);
  });

  it("stays out of the way for the owner and for spaces that aren't quiet", () => {
    const quiet = space({ items: [{}], messages: [{ createdAt: daysAgo(9) }] });
    expect(nudgeFor(quiet, "alex", NOW)).toBeNull();
    expect(nudgeFor(space({ items: [{}], messages: [{ createdAt: daysAgo(1) }] }), "me", NOW)).toBeNull();
  });
});
