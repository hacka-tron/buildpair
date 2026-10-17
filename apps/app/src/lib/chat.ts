import type { Message } from "@buildpair/protocol";
import { localToday } from "./format";

/** How close together two lines from one person must be to group under one avatar. */
const RUN_GAP_MS = 5 * 60_000;

/** Whether `b` continues `a`: both plain text, from the same person, within five minutes, on one day. */
export function runs(a: Message | undefined, b: Message | undefined): boolean {
  if (!a || !b || a.kind !== "text" || b.kind !== "text" || a.authorId !== b.authorId) return false;
  if (Math.abs(Date.parse(b.createdAt) - Date.parse(a.createdAt)) >= RUN_GAP_MS) return false;
  return localToday(new Date(a.createdAt)) === localToday(new Date(b.createdAt));
}
