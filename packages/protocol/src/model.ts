import { z } from "zod";
import { LocalDate, Timestamp, Ulid, UserId } from "./ids";

export const ItemKind = z.enum(["todo", "habit", "goal"]);
export type ItemKind = z.infer<typeof ItemKind>;

/** "space": everyone in the space sees it. "owner": only the person who created it. */
export const Visibility = z.enum(["space", "owner"]);
export type Visibility = z.infer<typeof Visibility>;

export const ItemStatus = z.enum(["open", "done", "wont"]);
export type ItemStatus = z.infer<typeof ItemStatus>;

export const Item = z.object({
  id: Ulid,
  kind: ItemKind,
  title: z.string().min(1).max(500),
  ownerId: UserId,
  parentId: Ulid.nullable(),
  visibility: Visibility,
  status: ItemStatus,
  /** To-dos and goals: the day it's due (goals: the deadline). */
  dueOn: LocalDate.nullable(),
  /** Habits: target check-offs per week. */
  timesPerWeek: z.number().int().min(1).max(7).nullable(),
  /** Habits: days checked off (local dates). */
  doneOn: z.array(LocalDate),
  createdAt: Timestamp,
});
export type Item = z.infer<typeof Item>;

export const MessageKind = z.enum(["text", "update", "completion", "skip"]);
export type MessageKind = z.infer<typeof MessageKind>;

export const Message = z.object({
  id: Ulid,
  /** Position in the space's log; assigned by the server. */
  seq: z.number().int().nonnegative(),
  authorId: UserId,
  kind: MessageKind,
  body: z.string().max(4000),
  itemId: Ulid.nullable(),
  createdAt: Timestamp,
});
export type Message = z.infer<typeof Message>;

export const Role = z.enum(["owner", "supporter"]);
export type Role = z.infer<typeof Role>;

export const Member = z.object({ userId: UserId, role: Role, name: z.string().max(80) });
export type Member = z.infer<typeof Member>;
