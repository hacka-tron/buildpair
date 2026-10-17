import { z } from "zod";
import { LocalDate, TimeOfDay, Timestamp, Ulid, UserId } from "./ids";
import { Item, Member, Message, SpaceColor, Visibility } from "./model";

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
/**
 * Someone deleted their account. They leave the space, and their items, messages and reactions go with
 * them. The room also removes their earlier events from its log, so nothing of theirs is sent again.
 */
export const MemberErased = ev("member.erased", z.object({ userId: UserId }));
/**
 * Someone left the space, or its owner removed them. Their messages stay in the chat and their items stay
 * as they were (private ones still hidden), but they can't see or change anything here any more.
 */
export const MemberRemoved = ev("member.removed", z.object({ userId: UserId }));
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
/**
 * An item (and a goal's steps) became private or shared. Going private names the items only, so it
 * can go to everyone and their devices drop them. Going shared carries the items as they are now,
 * with the chat lines and reactions about them, because the other members never received them.
 */
export const ItemVisibilitySet = ev(
  "item.visibility",
  z.object({
    itemIds: z.array(Ulid).min(1),
    visibility: Visibility,
    items: z.array(Item),
    messages: z.array(Message),
    reactions: z.record(z.string(), z.record(z.string(), z.array(UserId))),
  }),
);
/**
 * Items left this space for another one (a goal with its steps). Their earlier events are deleted from
 * this space's log; chat lines about shared items stay. Says only IDs, so the other space stays unnamed.
 */
export const ItemMoved = ev(
  "item.moved",
  z.object({ itemIds: z.array(Ulid).min(1), visibility: Visibility }),
);
/** Items moved here from another space, as they were there (done days, skips, visibility). */
export const ItemArrived = ev("item.arrived", z.object({ items: z.array(Item).min(1) }));
export const ItemCompleted = ev("item.completed", z.object({ itemId: Ulid, on: LocalDate }));
export const ItemSkipped = ev("item.skipped", z.object({ itemId: Ulid, on: LocalDate }));
export const ItemWontDo = ev("item.wont", z.object({ itemId: Ulid }));
/** A tick or "won't do" taken back. `messageId` is the chat line it posted, which goes with it. */
export const ItemReopened = ev(
  "item.reopened",
  z.object({ itemId: Ulid, on: LocalDate, messageId: Ulid.nullable() }),
);
/**
 * Items deleted (a goal with its steps). Like a move, their earlier events are deleted from the log and
 * chat lines about shared items stay.
 */
export const ItemDeleted = ev(
  "item.deleted",
  z.object({ itemIds: z.array(Ulid).min(1), visibility: Visibility }),
);
export const MessagePosted = ev("message.posted", z.object({ message: Message }));
export const ReactionToggled = ev(
  "reaction.toggled",
  z.object({ messageId: Ulid, emoji: z.string(), userId: UserId, on: z.boolean() }),
);

export const SpaceEvent = z.discriminatedUnion("type", [
  SpaceCreated,
  SpaceEdited,
  MemberJoined,
  MemberErased,
  MemberRemoved,
  ItemCreated,
  ItemEdited,
  ItemVisibilitySet,
  ItemMoved,
  ItemArrived,
  ItemCompleted,
  ItemSkipped,
  ItemWontDo,
  ItemReopened,
  ItemDeleted,
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
