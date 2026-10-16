import { useEffect, useRef } from "react";

/** Whether a key press is someone typing (a field has focus), not a shortcut. */
export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable === true;
}

/**
 * Single-key shortcuts on the web (keys like "q" or "Escape"). Ignored while typing in a field or with
 * ⌘, Ctrl or Alt held, so they never get in the way of writing or the browser's own shortcuts.
 */
export function useShortcuts(keys: Record<string, (() => void) | undefined>, enabled = true) {
  const latest = useRef(keys);
  latest.current = keys;
  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (e.key !== "Escape" && isTyping(e.target)) return;
      const run = latest.current[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (!run) return;
      e.preventDefault();
      run();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [enabled]);
}
