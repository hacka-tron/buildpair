import { z } from "zod";
import { Command } from "./commands";
import { SpaceEvent } from "./events";
import { Ulid, UserId } from "./ids";

/** Bump when a change would break older clients. */
export const PROTOCOL_VERSION = 10;
/**
 * The oldest version the server still talks to; older clients are told to update. Clients before 3
 * drop a whole batch when one event is new to them, so they can't stay connected safely.
 */
export const MIN_PROTOCOL_VERSION = 10;

export const ClientMessage = z.discriminatedUnion("t", [
  z.object({ t: z.literal("hello"), v: z.number().int(), afterSeq: z.number().int().nonnegative() }),
  z.object({ t: z.literal("cmd"), cmd: Command }),
  z.object({ t: z.literal("typing") }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

export const ServerMessage = z.discriminatedUnion("t", [
  /**
   * Events in (after, upTo]. Some numbers in that range may be missing on purpose: events about
   * other people's private items are never sent. Move the cursor to `upTo`; if `after` is beyond
   * your cursor, you missed something and should pull.
   */
  z.object({
    t: z.literal("events"),
    after: z.number().int().nonnegative(),
    upTo: z.number().int().nonnegative(),
    events: z.array(SpaceEvent),
  }),
  z.object({ t: z.literal("ack"), id: Ulid, seq: z.number().int().nonnegative() }),
  z.object({ t: z.literal("reject"), id: Ulid, reason: z.string() }),
  /** Too many changes in a short time: keep this one and send it again a little later. */
  z.object({ t: z.literal("busy"), id: Ulid, reason: z.string() }),
  z.object({ t: z.literal("presence"), online: z.array(UserId) }),
  z.object({ t: z.literal("typing"), userId: UserId }),
  z.object({ t: z.literal("error"), reason: z.string() }),
]);
export type ServerMessage = z.infer<typeof ServerMessage>;

/** spaceId -> the last chat position someone has read there, on any of their devices. */
export const ReadPositions = z.record(z.string().min(1).max(64), z.number().int().nonnegative());
export type ReadPositions = z.infer<typeof ReadPositions>;

/**
 * Messages on a person's inbox socket (their UserHub): small notices that a space has news, and how far
 * they've read (all of it after they say hello, then whatever another device reads).
 */
export const InboxMessage = z.discriminatedUnion("t", [
  z.object({ t: z.literal("poke"), spaceId: z.string(), seq: z.number().int().nonnegative() }),
  /** `all` marks the answer to a hello: every saved position. */
  z.object({ t: z.literal("reads"), reads: ReadPositions, all: z.boolean().optional() }),
  z.object({ t: z.literal("error"), reason: z.string() }),
]);
export type InboxMessage = z.infer<typeof InboxMessage>;

/** What a device says on its inbox socket: how far it has read. `all` asks for every saved position back. */
export const InboxClientMessage = z.object({
  t: z.literal("read"),
  reads: ReadPositions.refine((r) => Object.keys(r).length <= 200, "Too many at once."),
  all: z.boolean().optional(),
});
export type InboxClientMessage = z.infer<typeof InboxClientMessage>;

/**
 * Read a server message, skipping single events this version doesn't know (newer servers add event
 * types). The batch's `after`/`upTo` still apply, so the cursor moves on instead of getting stuck.
 */
export function parseServerMessage(raw: unknown): ServerMessage | null {
  const whole = ServerMessage.safeParse(raw);
  if (whole.success) return whole.data;
  const batch = z
    .object({
      t: z.literal("events"),
      after: z.number().int().nonnegative(),
      upTo: z.number().int().nonnegative(),
      events: z.array(z.unknown()),
    })
    .safeParse(raw);
  if (!batch.success) return null;
  const events = batch.data.events.flatMap((e) => {
    const one = SpaceEvent.safeParse(e);
    return one.success ? [one.data] : [];
  });
  return { ...batch.data, events };
}
