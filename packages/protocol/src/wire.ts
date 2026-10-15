import { z } from "zod";
import { Command } from "./commands";
import { SpaceEvent } from "./events";
import { Ulid, UserId } from "./ids";

/** Bump when a change would break older clients; the server accepts the current and previous versions. */
export const PROTOCOL_VERSION = 2;

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
  z.object({ t: z.literal("presence"), online: z.array(UserId) }),
  z.object({ t: z.literal("typing"), userId: UserId }),
  z.object({ t: z.literal("error"), reason: z.string() }),
]);
export type ServerMessage = z.infer<typeof ServerMessage>;

/** Messages on a person's inbox socket (their UserHub): small notices that a space has news. */
export const InboxMessage = z.discriminatedUnion("t", [
  z.object({ t: z.literal("poke"), spaceId: z.string(), seq: z.number().int().nonnegative() }),
  z.object({ t: z.literal("error"), reason: z.string() }),
]);
export type InboxMessage = z.infer<typeof InboxMessage>;
