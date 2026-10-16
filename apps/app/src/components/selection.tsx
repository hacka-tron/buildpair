import type { Item } from "@buildpair/protocol";
import type { Change } from "@buildpair/sync";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { colors, radius, space } from "../lib/theme";
import { Icon, Sheet } from "./kit";
import { NO_SCHEDULE, type Schedule, SchedulePanel } from "./schedule";
import { Button } from "./ui";

/** A selected item and the space it lives in, so each change goes to the right room. */
export type Picked = { item: Item; spaceId: string };

/** Which items are selected. Selecting starts with a press and hold, or the Select button on wide screens. */
export function useSelection() {
  const [active, setActive] = useState(false);
  const [picked, setPicked] = useState<Record<string, Picked>>({});
  const toggle = (p: Picked) => {
    setActive(true);
    setPicked((current) => {
      const next = { ...current };
      if (next[p.item.id]) delete next[p.item.id];
      else next[p.item.id] = p;
      return next;
    });
  };
  const clear = () => {
    setActive(false);
    setPicked({});
  };
  /** Row props for one item. Only your own open items can be selected. */
  const rowProps = (item: Item, spaceId: string, userId: string) => ({
    active,
    selected: Boolean(picked[item.id]),
    onSelect: item.ownerId === userId && item.status === "open" ? () => toggle({ item, spaceId }) : undefined,
  });
  return { active, start: () => setActive(true), picked: Object.values(picked), rowProps, clear };
}

/**
 * The bar shown while selecting: Done, Skip today, Won't do and Reschedule apply to every selected
 * item that allows it. `apply` returns why a change didn't happen, or null.
 */
export function SelectionBar(props: {
  picked: Picked[];
  today: string;
  wide: boolean;
  onClear: () => void;
  apply: (spaceId: string, change: Change) => string | null;
}) {
  const { picked, today } = props;
  const [rescheduling, setRescheduling] = useState(false);
  const [problem, setProblem] = useState("");
  const n = picked.length;
  const dated = picked.filter((p) => p.item.kind !== "habit");
  const skippable = picked.filter((p) => p.item.kind !== "goal");

  const run = (targets: Picked[], change: (item: Item) => Change) => {
    const failed = targets
      .map((p) => props.apply(p.spaceId, change(p.item)))
      .filter((reason): reason is string => Boolean(reason));
    if (failed.length) {
      setProblem(
        failed.length === targets.length
          ? (failed[0] ?? "That didn't work.")
          : `${targets.length - failed.length} done. ${failed.length} couldn't be changed. ${failed[0]}`,
      );
      return;
    }
    setProblem("");
    props.onClear();
  };

  const action = (label: string, enabled: boolean, onPress: () => void) => (
    <Pressable
      key={label}
      onPress={onPress}
      disabled={!enabled}
      accessibilityRole="button"
      style={({ pressed }) => ({
        paddingHorizontal: space.md,
        paddingVertical: 10,
        borderRadius: radius.control,
        backgroundColor: pressed ? "rgba(255,255,255,0.12)" : "transparent",
        opacity: enabled ? 1 : 0.4,
      })}
    >
      <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );

  return (
    <>
      <View
        style={{
          position: "absolute",
          left: props.wide ? space.xxl : space.md,
          right: props.wide ? undefined : space.md,
          bottom: space.lg,
          maxWidth: 720,
          backgroundColor: colors.bar,
          borderRadius: radius.card,
          paddingVertical: space.sm,
          paddingHorizontal: space.sm,
          gap: 4,
          shadowColor: "#000",
          shadowOpacity: 0.2,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 8,
        }}
      >
        {problem ? (
          <Text style={{ color: "#FFC9C4", fontSize: 13, paddingHorizontal: space.sm }}>{problem}</Text>
        ) : null}
        {/* Wide: one row. Phones: the count on top, the actions spread evenly below. */}
        <View
          style={{
            flexDirection: props.wide ? "row" : "column",
            alignItems: props.wide ? "center" : "stretch",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", flexGrow: props.wide ? 1 : 0 }}>
            <Pressable
              onPress={props.onClear}
              accessibilityRole="button"
              accessibilityLabel="Stop selecting"
              hitSlop={8}
              style={{ padding: space.sm }}
            >
              <Icon name="x" size={18} color="#fff" />
            </Pressable>
            <Text style={{ color: "#fff", fontSize: 14, marginRight: "auto", paddingRight: space.sm }}>
              {n === 0 ? "Select items" : `${n} selected`}
            </Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: props.wide ? "flex-end" : "space-between" }}>
            {action("Done", n > 0, () =>
              run(picked, (item) => ({ type: "item.complete", payload: { itemId: item.id, on: today } })),
            )}
            {action(props.wide ? "Skip today" : "Skip", skippable.length > 0, () =>
              run(skippable, (item) => ({
                type: "item.skip",
                payload: { itemId: item.id, on: today, reason: null },
              })),
            )}
            {action("Won't do", n > 0, () =>
              run(picked, (item) => ({ type: "item.wont", payload: { itemId: item.id, reason: null } })),
            )}
            {action("Reschedule", dated.length > 0, () => setRescheduling(true))}
          </View>
        </View>
      </View>
      {rescheduling ? (
        <Reschedule
          count={dated.length}
          skipped={n - dated.length}
          first={dated[0]?.item}
          wide={props.wide}
          onClose={() => setRescheduling(false)}
          onApply={(s) => {
            setRescheduling(false);
            run(dated, (item) => ({
              type: "item.edit",
              payload: {
                itemId: item.id,
                dueOn: s.dueOn,
                dueTime: item.kind === "goal" || !s.dueOn ? null : s.dueTime,
              },
            }));
          }}
        />
      ) : null}
    </>
  );
}

function Reschedule(props: {
  count: number;
  skipped: number;
  first: Item | undefined;
  wide: boolean;
  onClose: () => void;
  onApply: (s: Schedule) => void;
}) {
  const [value, setValue] = useState<Schedule>(
    props.first ? { ...NO_SCHEDULE, dueOn: props.first.dueOn, dueTime: props.first.dueTime } : NO_SCHEDULE,
  );
  return (
    <Sheet visible onClose={props.onClose} title={`Reschedule ${props.count}`} wide={props.wide}>
      {props.skipped ? (
        <Text style={{ fontSize: 13, color: colors.sub }}>
          {props.skipped === 1 ? "1 habit" : `${props.skipped} habits`} selected too. Habits repeat, so they
          keep their schedule.
        </Text>
      ) : null}
      <SchedulePanel mode="date" value={value} onChange={setValue} />
      <Button label="Apply" onPress={() => props.onApply(value)} />
    </Sheet>
  );
}
