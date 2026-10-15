import { z } from "zod";
import { LocalDate, TimeOfDay, Timestamp, Ulid, UserId } from "./ids";
import { Item, Member, Message, SpaceColor } from "./model";

const ev = <T extends string, P extends z.ZodType>(type: T, payload: P) =>
  z.object({
    seq: z.number().int().positive(),
    type: z.literal(type),
    actorId: UserId,
    /** The command that produced this event, so its sender can match it to a pending change. */
    commandId: Ulid.nullable(),
    at: Timestamp,
    payload,
  });

export const SpaceCreated = ev("space.created", z.object({ name: z.string(), purpose: z.string() }));
export const SpaceEdited = ev(
  "space.edited",
  z.object({
    changes: z.object({
      name: z.string().min(1).max(60).optional(),
      purpose: z.string().min(1).max(280).optional(),
      color: SpaceColor.optional(),
    }),
  }),
);
export const MemberJoined = ev("member.joined", z.object({ member: Member }));
export const ItemCreated = ev("item.created", z.object({ item: Item }));
export const ItemEdited = ev(
  "item.edited",
  z.object({
    itemId: Ulid,
    changes: z.object({
      title: z.string().min(1).max(500).optional(),
      dueOn: LocalDate.nullable().optional(),
      dueTime: TimeOfDay.nullable().optional(),
      timesPerWeek: z.number().int().min(1).max(7).optional(),
    }),
  }),
);
export const ItemCompleted = ev("item.completed", z.object({ itemId: Ulid, on: LocalDate }));
export const ItemSkipped = ev("item.skipped", z.object({ itemId: Ulid, on: LocalDate }));
export const ItemWontDo = ev("item.wont", z.object({ itemId: Ulid }));
export const MessagePosted = ev("message.posted", z.object({ message: Message }));
export const ReactionToggled = ev(
  "reaction.toggled",
  z.object({ messageId: Ulid, emoji: z.string(), userId: UserId, on: z.boolean() }),
);

export const SpaceEvent = z.discriminatedUnion("type", [
  SpaceCreated,
  SpaceEdited,
  MemberJoined,
  ItemCreated,
  ItemEdited,
  ItemCompleted,
  ItemSkipped,
  ItemWontDo,
  MessagePosted,
  ReactionToggled,
]);
export type SpaceEvent = z.infer<typeof SpaceEvent>;
export type SpaceEventType = SpaceEvent["type"];
/** An event before the server has numbered it. */
export type UnsequencedEvent = SpaceEvent extends infer E
  ? E extends SpaceEvent
    ? Omit<E, "seq">
    : never
  : never;

export { Timestamp };
