import { newId, type SpaceState, weekProgress } from "@buildpair/domain";
import type { Item } from "@buildpair/protocol";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { ItemSheet } from "../components/item-sheet";
import {
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
import { PageHeader, Shell, useWide } from "../components/shell";
import { Button, ErrorText } from "../components/ui";
import type { SpaceSummary } from "../lib/api";
import { authClient } from "../lib/auth";
import { localToday, longDate } from "../lib/format";
import { applyChange, useSpaces, useSpaceViews } from "../lib/spaces";
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

const doneOnDay = (item: Item, today: string) =>
  item.kind === "habit" ? item.doneOn.includes(today) : item.status === "done" && item.dueOn === today;

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
  const [problem, setProblem] = useState("");
  const [opened, setOpened] = useState<{ spaceId: string; item: Item } | null>(null);

  const groups = (spaces ?? []).map((s) => {
    const view = views[s.id];
    const all = Object.values(view?.items ?? {});
    const open = all.filter((i) => forToday(i, today, view) && !doneOnDay(i, today));
    const doneToday = all.filter((i) => doneOnDay(i, today));
    return { space: s, view, open, doneToday };
  });
  const left = groups.reduce((n, g) => n + g.open.length, 0);
  const done = groups.reduce((n, g) => n + g.doneToday.length, 0);

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
          right={wide ? <Button label="Add" onPress={() => setAdding(true)} /> : undefined}
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
      </ScrollView>
      {!wide ? <Fab label="Add" onPress={() => setAdding(true)} /> : null}
      <QuickAdd
        visible={adding}
        onClose={() => setAdding(false)}
        spaces={spaces ?? []}
        wide={wide}
        onAdd={(spaceId, draft) =>
          applyChange(spaceId, userId, { type: "item.create", payload: { itemId: newId(), ...draft } })
        }
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

type Kind = "todo" | "habit" | "goal";
type Draft = { kind: Kind; title: string; dueOn: string | null; timesPerWeek: number | null };

const KINDS: { kind: Kind; label: string }[] = [
  { kind: "todo", label: "To-do" },
  { kind: "habit", label: "Habit" },
  { kind: "goal", label: "Goal" },
];
const WHEN = [
  { label: "Today", offset: 0 },
  { label: "Tomorrow", offset: 1 },
  { label: "No date", offset: null },
] as const;
const BY = [
  { label: "In a week", offset: 7 },
  { label: "In a month", offset: 30 },
  { label: "No deadline", offset: null },
] as const;
const PLACEHOLDER: Record<Kind, string> = {
  todo: "Email 3 beta users",
  habit: "Gym",
  goal: "Launch v1",
};

function QuickAdd(props: {
  visible: boolean;
  onClose: () => void;
  spaces: SpaceSummary[];
  wide: boolean;
  /** Returns why it couldn't add, or null when it worked. */
  onAdd: (spaceId: string, draft: Draft) => string | null;
}) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<Kind>("todo");
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [when, setWhen] = useState<number | null>(0);
  const [by, setBy] = useState<number | null>(30);
  const [times, setTimes] = useState(3);
  const [error, setError] = useState("");
  const chosen = spaceId ?? props.spaces[0]?.id ?? null;
  const day = (offset: number | null) =>
    offset === null ? null : localToday(new Date(Date.now() + offset * 86400000));
  const add = () => {
    if (!title.trim() || !chosen) return;
    const problem = props.onAdd(chosen, {
      kind,
      title: title.trim(),
      dueOn: kind === "todo" ? day(when) : kind === "goal" ? day(by) : null,
      timesPerWeek: kind === "habit" ? times : null,
    });
    if (problem) return setError(problem);
    setError("");
    setTitle("");
    props.onClose();
  };
  return (
    <Sheet visible={props.visible} onClose={props.onClose} title="Add" wide={props.wide}>
      {props.spaces.length === 0 ? (
        <Text style={{ fontSize: 14, color: colors.sub }}>Make a space first, then add things to it.</Text>
      ) : (
        <>
          <ChipRow label="What">
            {KINDS.map((k) => (
              <Chip key={k.kind} on={kind === k.kind} onPress={() => setKind(k.kind)}>
                {k.label}
              </Chip>
            ))}
          </ChipRow>
          <TextInput
            autoFocus
            value={title}
            onChangeText={setTitle}
            onSubmitEditing={add}
            placeholder={PLACEHOLDER[kind]}
            placeholderTextColor={colors.faint}
            accessibilityLabel="Title"
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
          {kind === "todo" ? (
            <ChipRow label="When">
              {WHEN.map((w) => (
                <Chip key={w.label} on={when === w.offset} onPress={() => setWhen(w.offset)}>
                  {w.label}
                </Chip>
              ))}
            </ChipRow>
          ) : null}
          {kind === "habit" ? (
            <ChipRow label="Times a week">
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <Chip key={n} on={times === n} onPress={() => setTimes(n)}>
                  {n === 7 ? "Every day" : String(n)}
                </Chip>
              ))}
            </ChipRow>
          ) : null}
          {kind === "goal" ? (
            <ChipRow label="Finish by">
              {BY.map((w) => (
                <Chip key={w.label} on={by === w.offset} onPress={() => setBy(w.offset)}>
                  {w.label}
                </Chip>
              ))}
            </ChipRow>
          ) : null}
          <ChipRow label="Space">
            {props.spaces.map((s) => (
              <Chip
                key={s.id}
                on={chosen === s.id}
                onPress={() => setSpaceId(s.id)}
                leading={<SpaceTile id={s.id} name={s.name} size={16} />}
              >
                {s.name}
              </Chip>
            ))}
          </ChipRow>
          <ErrorText>{error}</ErrorText>
          <Button label="Add" onPress={add} disabled={!title.trim()} />
        </>
      )}
    </Sheet>
  );
}
