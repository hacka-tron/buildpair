import type { Item } from "@buildpair/protocol";
import type { Change } from "@buildpair/sync";
import { useSyncExternalStore } from "react";

/**
 * Ticking, untick and delete, the way good to-do apps do it (see docs/design/todo-study.md): a tick can
 * always be taken back, a just-ticked item stays where it was for a moment, and every tick or delete
 * shows a short "Undo" notice. Deletes wait until the notice is gone, so Undo needs nothing from the
 * server.
 */

/** How long a just-ticked item keeps its place before moving down. */
export const SETTLE_MS = 1200;
/** How long the Undo notice stays. */
export const UNDO_MS = 5000;

type Notice = { id: number; text: string; undo: (() => void) | null };

let notice: Notice | null = null;
let held = new Set<string>();
let hidden = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

let noticeTimer: ReturnType<typeof setTimeout> | null = null;
let nextId = 1;

/** Show a short notice, with Undo when there's something to take back. Replaces any notice showing. */
export function notify(text: string, undo: (() => void) | null = null) {
  if (noticeTimer) clearTimeout(noticeTimer);
  const id = nextId++;
  notice = { id, text, undo };
  noticeTimer = setTimeout(() => dismiss(id), UNDO_MS);
  emit();
}

export function dismiss(id?: number) {
  if (!notice || (id !== undefined && notice.id !== id)) return;
  notice = null;
  emit();
}

export function useNotice(): Notice | null {
  return useSyncExternalStore(
    subscribe,
    () => notice,
    () => notice,
  );
}

/** Whether an item counts as ticked for the day it's shown on. */
export function isTicked(item: Item, today: string): boolean {
  return item.kind === "habit" ? item.doneOn.includes(today) : item.status !== "open";
}

/** Items that keep their place for a moment after being ticked. */
export function useHeld(): ReadonlySet<string> {
  return useSyncExternalStore(
    subscribe,
    () => held,
    () => held,
  );
}

function hold(itemId: string) {
  held = new Set(held).add(itemId);
  emit();
  setTimeout(() => {
    held = new Set(held);
    held.delete(itemId);
    emit();
  }, SETTLE_MS);
}

/**
 * The circle: tick it, or take the tick back. `apply` returns why it didn't happen, or null.
 * Returns the problem, if any.
 */
export function toggle(item: Item, today: string, apply: (change: Change) => string | null): string | null {
  const reopen: Change = { type: "item.reopen", payload: { itemId: item.id, on: today } };
  if (isTicked(item, today)) return apply(reopen);
  const problem = apply({ type: "item.complete", payload: { itemId: item.id, on: today } });
  if (problem) return problem;
  hold(item.id);
  notify(item.kind === "goal" ? "Goal finished" : "Done", () => apply(reopen));
  return null;
}

/** Items deleted but not sent yet, while their Undo notice shows. */
export function useHidden(): ReadonlySet<string> {
  return useSyncExternalStore(
    subscribe,
    () => hidden,
    () => hidden,
  );
}

const pending = new Map<string, { timer: ReturnType<typeof setTimeout>; send: () => void }>();

/** Delete items after the Undo notice, hiding them meanwhile. `send` makes the actual change. */
export function deleteLater(itemIds: string[], text: string, send: () => void) {
  const key = itemIds.join(",");
  const finish = () => {
    if (!pending.delete(key)) return;
    send();
    hidden = new Set(hidden);
    for (const id of itemIds) hidden.delete(id);
    emit();
  };
  pending.set(key, { timer: setTimeout(finish, UNDO_MS), send: finish });
  hidden = new Set([...hidden, ...itemIds]);
  notify(text, () => {
    const p = pending.get(key);
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(key);
    hidden = new Set(hidden);
    for (const id of itemIds) hidden.delete(id);
    emit();
  });
}

/** Send every waiting delete now (the page is closing, or the person is signing out). */
export function flushDeletes() {
  for (const { timer, send } of [...pending.values()]) {
    clearTimeout(timer);
    send();
  }
}

if (typeof window !== "undefined" && typeof window.addEventListener === "function")
  window.addEventListener("pagehide", flushDeletes);
