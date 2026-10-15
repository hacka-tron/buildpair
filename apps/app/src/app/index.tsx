import { newId, parseQuickAdd, type SpaceState, weekProgress } from "@buildpair/domain";
import type { Item } from "@buildpair/protocol";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { ItemSheet } from "../components/item-sheet";
import {
  Avatar,
  Card,
  Chip,
  ChipRow,
  Fab,
  Faces,
  Icon,
  ItemRow,
  SectionHeader,
  Sheet,
  SpaceTile,
} from "../components/kit";
import { kindOf, NO_SCHEDULE, type Schedule, SchedulePanel, scheduleLabel } from "../components/schedule";
import { SelectionBar, useSelection } from "../components/selection";
import { PageHeader, Shell, useWide } from "../components/shell";
import { Button, ErrorText } from "../components/ui";
import type { SpaceSummary } from "../lib/api";
import { authClient } from "../lib/auth";
import { localToday, longDate } from "../lib/format";
import { applyChange, useSpaces, useSpaceViews } from "../lib/spaces";
import { TEMPLATES, type Template } from "../lib/templates";
import { colors, radius, space } from "../lib/theme";

/**
 * What's on today: anything open that's due today or earlier, habits, top-level things without a
 * date, and goal steps that are due.
 */
function forToday(item: Item, today: string, view: SpaceState | undefined) {
  if (item.status !== "open") return false;
  if (item.parentId) {
    if (view?.items[item.parentId]?.status !== "open") return false;
    return Boolean(item.dueOn && item.dueOn <= today);
  }
  return !item.dueOn || item.dueOn <= today;
}

// Items finished before finish days were recorded fall back to their due day.
const doneOnDay = (item: Item, today: string) =>
  item.doneOn.includes(today) ||
  (item.kind !== "habit" && item.status === "done" && item.doneOn.length === 0 && item.dueOn === today);
const skippedToday = (item: Item, today: string) => item.skippedOn.includes(today);

export default function Today() {
  const wide = useWide();
  const today = localToday();
  const { data: session } = authClient.useSession();
  const userId = session?.user.id ?? "";
  const { spaces, error } = useSpaces();
  const ids = useMemo(() => (spaces ?? []).map((s) => s.id), [spaces]);
  const views = useSpaceViews(ids, userId);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState(false);
  const [showUpcoming, setShowUpcoming] = useState(true);
  const selection = useSelection();
  // A goal just made from a template opens as soon as it shows up in the space.
  const [toOpen, setToOpen] = useState<{ spaceId: string; itemId: string } | null>(null);
  useEffect(() => {
    const item = toOpen && views[toOpen.spaceId]?.items[toOpen.itemId];
    if (!toOpen || !item) return;
    setOpened({ spaceId: toOpen.spaceId, item });
    setToOpen(null);
  }, [toOpen, views]);
  const [problem, setProblem] = useState("");
  const [opened, setOpened] = useState<{ spaceId: string; item: Item } | null>(null);

  const groups = (spaces ?? []).map((s) => {
    const view = views[s.id];
    const all = Object.values(view?.items ?? {});
    const open = all.filter(
      (i) => forToday(i, today, view) && !doneOnDay(i, today) && !skippedToday(i, today),
    );
    const doneToday = all.filter((i) => doneOnDay(i, today));
    return { space: s, view, open, doneToday };
  });
  const left = groups.reduce((n, g) => n + g.open.length, 0);
  const done = groups.reduce((n, g) => n + g.doneToday.length, 0);
  // Open things due in the next two weeks, and goals with any deadline, soonest first, so nothing added
  // for later drops out of sight.
  const horizon = localToday(new Date(Date.now() + 14 * 86400000));
  const upcoming = groups
    .flatMap(({ space: s, view }) =>
      Object.values(view?.items ?? {})
        .filter(
          (i) =>
            i.status === "open" &&
            i.kind !== "habit" &&
            i.dueOn !== null &&
            i.dueOn > today &&
            (i.kind === "goal" || i.dueOn <= horizon) &&
            (!i.parentId || view?.items[i.parentId]?.status === "open"),
        )
        .map((item) => ({ item, space: s, view })),
    )
    .sort((a, b) =>
      `${a.item.dueOn}${a.item.dueTime ?? "99"}`.localeCompare(`${b.item.dueOn}${b.item.dueTime ?? "99"}`),
    );

  return (
    <Shell active="today">
      <ScrollView
        contentContainerStyle={{
          padding: wide ? space.xxl : space.lg,
          paddingBottom: 120,
          maxWidth: 760,
          width: "100%",
          alignSelf: wide ? "flex-start" : "center",
        }}
      >
        <PageHeader
          title="Today"
          sub={`${longDate()} · ${left} left${done ? ` · ${done} done` : ""}`}
          right={
            wide ? (
              <View style={{ flexDirection: "row", gap: space.sm }}>
                {!selection.active && left + done > 0 ? (
                  <Button label="Select" kind="secondary" onPress={selection.start} />
                ) : null}
                <Button label="Add" onPress={() => setAdding(true)} />
              </View>
            ) : (
              <Pressable
                onPress={() => router.push("/profile")}
                accessibilityRole="link"
                accessibilityLabel="Your profile"
                hitSlop={8}
              >
                <Avatar id={userId || "me"} name={session?.user.name || "?"} size={34} />
              </Pressable>
            )
          }
        />
        <ErrorText>{error || problem}</ErrorText>
        {spaces && spaces.length === 0 ? <FirstRun /> : null}
        {groups.map(({ space: s, view, open, doneToday }) => {
          const isOpen = !collapsed[s.id];
          const people = Object.values(view?.members ?? {})
            .filter((m) => m.userId !== userId)
            .map((m) => ({ id: m.userId, name: m.name }));
          return (
            <View key={s.id} style={{ marginTop: space.md }}>
              <SectionHeader
                open={isOpen}
                onToggle={() => setCollapsed((c) => ({ ...c, [s.id]: !c[s.id] }))}
                right={
                  <Pressable
                    onPress={() => router.push({ pathname: "/spaces/[id]", params: { id: s.id } })}
                    accessibilityRole="link"
                    accessibilityLabel={`Open ${s.name}`}
                    hitSlop={8}
                    style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                  >
                    {people.length ? (
                      <Faces people={people} size={20} />
                    ) : (
                      <Text style={{ fontSize: 12, color: colors.faint }}>Only you</Text>
                    )}
                    <Icon name="chevron-right" size={16} color={colors.faint} />
                  </Pressable>
                }
              >
                <SpaceTile id={s.id} name={s.name} size={20} />
                <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: "700", color: colors.ink }}>
                  {s.name}
                </Text>
                {open.length + doneToday.length > 0 ? (
                  <Text style={{ fontSize: 12, color: colors.faint }}>
                    {doneToday.length} of {open.length + doneToday.length} done
                  </Text>
                ) : null}
              </SectionHeader>
              {isOpen ? (
                <View style={{ paddingLeft: wide ? 22 : 0 }}>
                  {open.length === 0 && doneToday.length === 0 ? (
                    <Text style={{ fontSize: 13, color: colors.faint, paddingVertical: space.sm }}>
                      Nothing due. Add something with the +.
                    </Text>
                  ) : null}
                  {[...open, ...doneToday].map((item, i, list) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      today={today}
                      last={i === list.length - 1}
                      meta={metaFor(item, today, view)}
                      selection={selection.rowProps(item, s.id, userId)}
                      onOpen={() => setOpened({ spaceId: s.id, item })}
                      onToggle={() =>
                        setProblem(
                          applyChange(s.id, userId, {
                            type: "item.complete",
                            payload: { itemId: item.id, on: today },
                          }) ?? "",
                        )
                      }
                    />
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
        {upcoming.length ? (
          <View style={{ marginTop: space.xl }}>
            <SectionHeader open={showUpcoming} onToggle={() => setShowUpcoming((v) => !v)}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: colors.ink }}>Coming up</Text>
              <Text style={{ fontSize: 12, color: colors.faint }}>Next two weeks, and goals</Text>
            </SectionHeader>
            {showUpcoming ? (
              <View style={{ paddingLeft: wide ? 22 : 0 }}>
                {upcoming.map(({ item, space: s, view }, i) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    today={today}
                    last={i === upcoming.length - 1}
                    meta={[s.name, metaFor(item, today, view)].filter(Boolean).join(" · ")}
                    selection={selection.rowProps(item, s.id, userId)}
                    onOpen={() => setOpened({ spaceId: s.id, item })}
                    onToggle={() =>
                      setProblem(
                        applyChange(s.id, userId, {
                          type: "item.complete",
                          payload: { itemId: item.id, on: today },
                        }) ?? "",
                      )
                    }
                  />
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
      {selection.active ? (
        <SelectionBar
          picked={selection.picked}
          today={today}
          wide={wide}
          onClear={selection.clear}
          apply={(spaceId, change) => applyChange(spaceId, userId, change)}
        />
      ) : !wide ? (
        <Fab label="Add" onPress={() => setAdding(true)} />
      ) : null}
      <QuickAdd
        visible={adding}
        onClose={() => setAdding(false)}
        spaces={spaces ?? []}
        wide={wide}
        onAdd={(spaceId, draft) =>
          applyChange(spaceId, userId, { type: "item.create", payload: { itemId: newId(), ...draft } })
        }
        onTemplate={(spaceId, t) => {
          const itemId = newId();
          const problem = applyChange(spaceId, userId, {
            type: "item.create",
            payload:
              t.kind === "habit"
                ? { itemId, kind: "habit", title: t.title, timesPerWeek: t.timesPerWeek ?? 3 }
                : {
                    itemId,
                    kind: "goal",
                    title: t.title,
                    dueOn: localToday(new Date(Date.now() + (t.weeks ?? 4) * 7 * 86400000)),
                  },
          });
          if (problem) return problem;
          for (const step of t.steps ?? [])
            applyChange(spaceId, userId, {
              type: "item.create",
              payload: { itemId: newId(), kind: "todo", title: step, parentId: itemId },
            });
          // Open the new goal so its steps (and where to add more) are right there.
          if (t.kind === "goal") setToOpen({ spaceId, itemId });
          return null;
        }}
      />
      <ItemSheet
        key={opened?.item.id ?? "none"}
        item={opened?.item ?? null}
        view={opened ? views[opened.spaceId] : undefined}
        userId={userId}
        today={today}
        wide={wide}
        onClose={() => setOpened(null)}
        apply={(change) => (opened ? applyChange(opened.spaceId, userId, change) : null)}
      />
    </Shell>
  );
}

function metaFor(item: Item, today: string, view: SpaceState | undefined) {
  if (item.kind === "habit") {
    const p = weekProgress(item, today);
    return `${p.done} of ${p.target} this week`;
  }
  const parent = item.parentId ? view?.items[item.parentId]?.title : undefined;
  if (parent) return `Step of ${parent}`;
  if (item.kind === "goal") {
    const steps = Object.values(view?.items ?? {}).filter((i) => i.parentId === item.id);
    return `${steps.filter((i) => i.status === "done").length} of ${steps.length} steps`;
  }
  return undefined;
}

function FirstRun() {
  return (
    <Card style={{ paddingVertical: space.xl, gap: space.md, marginTop: space.lg }}>
      <Text style={{ fontSize: 17, fontWeight: "700", color: colors.ink }}>Start with a space</Text>
      <Text style={{ fontSize: 14, color: colors.sub, lineHeight: 20 }}>
        A space is a list and one chat for something you're working on. Make one, add a few things to it, then
        invite someone to keep you honest.
      </Text>
      <View style={{ alignSelf: "flex-start" }}>
        <Button
          label="Make a space"
          onPress={() => router.push({ pathname: "/spaces", params: { new: "1" } })}
        />
      </View>
    </Card>
  );
}

type Draft = {
  kind: "todo" | "habit" | "goal";
  title: string;
  dueOn: string | null;
  dueTime: string | null;
  timesPerWeek: number | null;
};

/**
 * Plain-words add: type "dentist friday 3pm" or "gym 4x a week" and the schedule is read from the words.
 * The date chip shows what was understood and opens the picker to change it.
 */
function QuickAdd(props: {
  visible: boolean;
  onClose: () => void;
  spaces: SpaceSummary[];
  wide: boolean;
  /** Returns why it couldn't add, or null when it worked. */
  onAdd: (spaceId: string, draft: Draft) => string | null;
  /** Creates a template's goal and steps (or habit) in a space; returns why not, or null. */
  onTemplate: (spaceId: string, template: Template) => string | null;
}) {
  const today = localToday();
  const [text, setText] = useState("");
  const [spaceId, setSpaceId] = useState<string | null>(null);
  // A schedule picked by hand wins over the words; "keep as typed" ignores the words.
  const [picked, setPicked] = useState<Schedule | null>(null);
  const [asTyped, setAsTyped] = useState(false);
  const [panel, setPanel] = useState<null | "when" | "space">(null);
  const [error, setError] = useState("");
  const chosen = spaceId ?? props.spaces[0]?.id ?? null;
  const parsed = parseQuickAdd(text, today);
  const fromWords = !asTyped && parsed.understood.length > 0;
  const schedule: Schedule =
    picked ??
    (fromWords
      ? {
          dueOn: parsed.dueOn,
          dueTime: parsed.dueTime,
          timesPerWeek: parsed.timesPerWeek,
          deadline: parsed.kind === "goal",
        }
      : NO_SCHEDULE);
  const title = fromWords ? parsed.title : text.trim();
  const reset = () => {
    setText("");
    setPicked(null);
    setAsTyped(false);
    setPanel(null);
    setError("");
  };
  const add = () => {
    if (!title || !chosen) return;
    const problem = props.onAdd(chosen, {
      kind: kindOf(schedule),
      title,
      dueOn: schedule.timesPerWeek ? null : schedule.dueOn,
      dueTime: schedule.timesPerWeek || schedule.deadline ? null : schedule.dueTime,
      timesPerWeek: schedule.timesPerWeek,
    });
    if (problem) return setError(problem);
    reset();
    props.onClose();
  };
  const space_ = props.spaces.find((s) => s.id === chosen);
  return (
    <Sheet
      visible={props.visible}
      onClose={() => {
        setPanel(null);
        props.onClose();
      }}
      title="Add"
      wide={props.wide}
    >
      {props.spaces.length === 0 ? (
        <Text style={{ fontSize: 14, color: colors.sub }}>Make a space first, then add things to it.</Text>
      ) : (
        <>
          <TextInput
            autoFocus
            value={text}
            onChangeText={(t) => {
              setText(t);
              setError("");
            }}
            onSubmitEditing={add}
            placeholder="Dentist friday 3pm, or gym 4x a week"
            placeholderTextColor={colors.faint}
            accessibilityLabel="What to add"
            style={{
              fontSize: 17,
              color: colors.ink,
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: radius.control,
              paddingHorizontal: space.md,
              paddingVertical: 12,
              outlineColor: colors.royal,
            }}
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, alignItems: "center" }}>
            <Chip
              on={panel === "when" || schedule !== NO_SCHEDULE}
              onPress={() => setPanel(panel === "when" ? null : "when")}
              leading={
                <Icon name={schedule.timesPerWeek ? "repeat" : "calendar"} size={14} color={colors.blue} />
              }
            >
              {scheduleLabel(schedule, today)}
            </Chip>
            <Chip
              on={panel === "space"}
              onPress={() => setPanel(panel === "space" ? null : "space")}
              leading={space_ ? <SpaceTile id={space_.id} name={space_.name} size={16} /> : undefined}
            >
              {space_?.name ?? "Space"}
            </Chip>
            {fromWords && !picked ? (
              <Pressable
                onPress={() => setAsTyped(true)}
                accessibilityRole="button"
                accessibilityLabel="Keep the words as typed"
                hitSlop={6}
                style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
              >
                <Text style={{ fontSize: 12, color: colors.faint }}>
                  Read "{parsed.understood.join(" ")}" as the{" "}
                  {kindOf(schedule) === "habit" ? "repeat" : "date"}
                </Text>
                <Icon name="x" size={12} color={colors.faint} />
              </Pressable>
            ) : null}
          </View>
          {panel === "when" ? (
            <SchedulePanel mode="any" value={schedule} onChange={(next) => setPicked(next)} />
          ) : null}
          {panel === "space" ? (
            <ChipRow label="Add to">
              {props.spaces.map((s) => (
                <Chip
                  key={s.id}
                  on={chosen === s.id}
                  onPress={() => {
                    setSpaceId(s.id);
                    setPanel(null);
                  }}
                  leading={<SpaceTile id={s.id} name={s.name} size={16} />}
                >
                  {s.name}
                </Chip>
              ))}
            </ChipRow>
          ) : null}
          {!text.trim() ? (
            <ChipRow label="Or start from a template">
              {TEMPLATES.map((t) => (
                <Chip
                  key={t.label}
                  on={false}
                  onPress={() => {
                    if (!chosen) return;
                    const problem = props.onTemplate(chosen, t);
                    if (problem) return setError(problem);
                    reset();
                    props.onClose();
                  }}
                >
                  {t.label}
                </Chip>
              ))}
            </ChipRow>
          ) : null}
          {title ? (
            <Text style={{ fontSize: 13, color: colors.sub }}>
              Adds{" "}
              <Text style={{ fontWeight: "600", color: colors.ink }}>
                {kindOf(schedule) === "habit"
                  ? "a habit"
                  : kindOf(schedule) === "goal"
                    ? "a goal"
                    : "a to-do"}
              </Text>{" "}
              called <Text style={{ fontWeight: "600", color: colors.ink }}>{title}</Text>
              {kindOf(schedule) === "goal" ? ". Open it after to add steps." : "."}
            </Text>
          ) : null}
          <ErrorText>{error}</ErrorText>
          <Button label="Add" onPress={add} disabled={!title} />
        </>
      )}
    </Sheet>
  );
}
