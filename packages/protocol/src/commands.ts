import { z } from "zod";
import { LocalDate, TimeOfDay, Timestamp, Ulid } from "./ids";
import { ItemKind, Reflection, Repeat, SpaceColor, Visibility } from "./model";

const cmd = <T extends string, P extends z.ZodType>(type: T, payload: P) =>
  z.object({ id: Ulid, type: z.literal(type), at: Timestamp, payload });

export const CreateItem = cmd(
  "item.create",
  z.object({
    itemId: Ulid,
    kind: ItemKind,
    title: z.string().trim().min(1).max(500),
    parentId: Ulid.nullable().default(null),
    visibility: Visibility.default("space"),
    dueOn: LocalDate.nullable().default(null),
    timesPerWeek: z.number().int().min(1).max(7).nullable().default(null),
    dueTime: TimeOfDay.nullable().default(null),
    notes: z.string().trim().max(5000).default(""),
    repeat: Repeat.nullable().default(null),
  }),
);

/** Change an item's details. Only the fields present change; null clears a date or time. */
export const EditItem = cmd(
  "item.edit",
  z.object({
    itemId: Ulid,
    title: z.string().trim().min(1).max(500).optional(),
    dueOn: LocalDate.nullable().optional(),
    dueTime: TimeOfDay.nullable().optional(),
    timesPerWeek: z.number().int().min(1).max(7).optional(),
    notes: z.string().trim().max(5000).optional(),
    repeat: Repeat.nullable().optional(),
  }),
);

/** Change a space's name, purpose or color. Owners only. */
export const EditSpace = cmd(
  "space.edit",
  z.object({
    name: z.string().trim().min(1).max(60).optional(),
    purpose: z.string().trim().min(1).max(280).optional(),
    color: SpaceColor.optional(),
  }),
);

/**
 * Make an item "only visible to me", or share it with the space again. Goals take their steps with
 * them; steps follow their goal and can't be changed alone.
 */
export const SetItemVisibility = cmd("item.visibility", z.object({ itemId: Ulid, visibility: Visibility }));

export const CompleteItem = cmd("item.complete", z.object({ itemId: Ulid, on: LocalDate }));
/**
 * Take back a tick (or "won't do"): a to-do or goal opens again, a habit loses that day's tick. The chat
 * line it posted goes too.
 */
export const ReopenItem = cmd("item.reopen", z.object({ itemId: Ulid, on: LocalDate }));
/** Delete an item for good. A goal takes its steps with it. */
export const DeleteItem = cmd("item.delete", z.object({ itemId: Ulid }));
export const SkipItem = cmd(
  "item.skip",
  z.object({ itemId: Ulid, on: LocalDate, reason: z.string().trim().max(500).nullable().default(null) }),
);
export const WontDoItem = cmd(
  "item.wont",
  z.object({ itemId: Ulid, reason: z.string().trim().max(500).nullable().default(null) }),
);
/** "Update" on an item: a note about it that lands in the chat. */
export const PostUpdate = cmd(
  "item.update",
  z.object({ itemId: Ulid, body: z.string().trim().min(1).max(4000) }),
);
export const SendMessage = cmd(
  "message.send",
  z.object({ messageId: Ulid, body: z.string().trim().min(1).max(4000) }),
);
/** A weekly look back, posted to the space's chat. */
export const PostReflection = cmd("reflection.post", Reflection.extend({ messageId: Ulid }));
export const ToggleReaction = cmd(
  "reaction.toggle",
  z.object({ messageId: Ulid, emoji: z.string().min(1).max(16) }),
);

export const Command = z.discriminatedUnion("type", [
  CreateItem,
  EditItem,
  SetItemVisibility,
  EditSpace,
  CompleteItem,
  ReopenItem,
  DeleteItem,
  SkipItem,
  WontDoItem,
  PostUpdate,
  SendMessage,
  PostReflection,
  ToggleReaction,
]);
export type Command = z.infer<typeof Command>;
export type CommandInput = z.input<typeof Command>;
export type CommandType = Command["type"];
