import { z } from "zod";
import { LocalDate, TimeOfDay, Timestamp, Ulid, UserId } from "./ids";

export const ItemKind = z.enum(["todo", "habit", "goal"]);
export type ItemKind = z.infer<typeof ItemKind>;

/** "space": everyone in the space sees it. "owner": only the person who created it. */
export const Visibility = z.enum(["space", "owner"]);
export type Visibility = z.infer<typeof Visibility>;

/** A space's color, by name; the app picks the exact shade. */
export const SpaceColor = z.enum(["blue", "green", "red", "purple", "amber", "teal", "pink", "slate"]);
export type SpaceColor = z.infer<typeof SpaceColor>;

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
  /** An optional time on the due day, HH:MM. Items saved before this existed read as null. */
  dueTime: TimeOfDay.nullable().default(null),
  /** Habits: target check-offs per week. */
  timesPerWeek: z.number().int().min(1).max(7).nullable(),
  /** Days checked off (local dates). Habits collect many; to-dos and goals record the day they were finished. */
  doneOn: z.array(LocalDate),
  /** Days skipped (local dates). Items saved before this existed read as empty. */
  skippedOn: z.array(LocalDate).default([]),
  createdAt: Timestamp,
});
export type Item = z.infer<typeof Item>;

/** "reflection": a weekly look back; its body is JSON with `wins`, `blockers` and `next` (see Reflection). */
export const MessageKind = z.enum(["text", "update", "completion", "skip", "reflection"]);
export type MessageKind = z.infer<typeof MessageKind>;

export const Reflection = z.object({
  wins: z.string().trim().max(1000),
  blockers: z.string().trim().max(1000),
  next: z.string().trim().max(1000),
});
export type Reflection = z.infer<typeof Reflection>;

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
