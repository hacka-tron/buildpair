import { newId, type SpaceState, weekProgress } from "@buildpair/domain";
import type { Item } from "@buildpair/protocol";
import { Link, router } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { Card, Chip, ChipRow, Fab, Faces, ItemRow, SectionHeader, Sheet, SpaceTile } from "../components/kit";
import { PageHeader, Shell, useWide } from "../components/shell";
import { Button, ErrorText } from "../components/ui";
import type { SpaceSummary } from "../lib/api";
import { authClient } from "../lib/auth";
import { localToday, longDate } from "../lib/format";
import { useSpaces, useSpaceViews } from "../lib/spaces";
import { colors, radius, space } from "../lib/theme";
import { getSync } from "../lib/use-space";

/** What's on today: due today or earlier, habits, and anything open without a date. */
function forToday(item: Item, today: string) {
  if (item.parentId || item.status !== "open") return false;
  return !item.dueOn || item.dueOn <= today;
}

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

  const groups = (spaces ?? []).map((s) => {
    const view = views[s.id];
    const all = Object.values(view?.items ?? {}).filter((i) => !i.parentId);
    const open = all.filter((i) => forToday(i, today));
    const doneToday = all.filter((i) => i.status === "done" && i.dueOn === today);
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
        <ErrorText>{error}</ErrorText>
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
                  people.length ? (
                    <Faces people={people} size={20} />
                  ) : (
                    <Text style={{ fontSize: 12, color: colors.faint }}>Only you</Text>
                  )
                }
              >
                <SpaceTile id={s.id} name={s.name} size={20} />
                <Link href={{ pathname: "/spaces/[id]", params: { id: s.id } }} asChild>
                  <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: "700", color: colors.ink }}>
                    {s.name}
                  </Text>
                </Link>
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
                      onToggle={() =>
                        getSync(s.id, userId).dispatch({
                          type: "item.complete",
                          payload: { itemId: item.id, on: today },
                        })
                      }
                    />
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
      {!wide ? <Fab label="Add a to-do" onPress={() => setAdding(true)} /> : null}
      <QuickAdd
        visible={adding}
        onClose={() => setAdding(false)}
        spaces={spaces ?? []}
        wide={wide}
        onAdd={(spaceId, title, dueOn) => {
          if (!views[spaceId]?.members[userId]) return "Still loading that space. Try again in a moment.";
          const result = getSync(spaceId, userId).dispatch({
            type: "item.create",
            payload: { itemId: newId(), kind: "todo", title, dueOn },
          });
          return result.ok ? null : result.reason;
        }}
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
  return parent;
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

const WHEN = [
  { label: "Today", offset: 0 },
  { label: "Tomorrow", offset: 1 },
  { label: "No date", offset: null },
] as const;

function QuickAdd(props: {
  visible: boolean;
  onClose: () => void;
  spaces: SpaceSummary[];
  wide: boolean;
  /** Returns why it couldn't add, or null when it worked. */
  onAdd: (spaceId: string, title: string, dueOn: string | null) => string | null;
}) {
  const [title, setTitle] = useState("");
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [when, setWhen] = useState<number | null>(0);
  const [error, setError] = useState("");
  const chosen = spaceId ?? props.spaces[0]?.id ?? null;
  const add = () => {
    if (!title.trim() || !chosen) return;
    const due = when === null ? null : localToday(new Date(Date.now() + when * 86400000));
    const problem = props.onAdd(chosen, title.trim(), due);
    if (problem) return setError(problem);
    setError("");
    setTitle("");
    props.onClose();
  };
  return (
    <Sheet visible={props.visible} onClose={props.onClose} title="Add to-do" wide={props.wide}>
      {props.spaces.length === 0 ? (
        <Text style={{ fontSize: 14, color: colors.sub }}>Make a space first, then add things to it.</Text>
      ) : (
        <>
          <TextInput
            autoFocus
            value={title}
            onChangeText={setTitle}
            onSubmitEditing={add}
            placeholder="Email 3 beta users"
            placeholderTextColor={colors.faint}
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
          <ChipRow label="When">
            {WHEN.map((w) => (
              <Chip key={w.label} on={when === w.offset} onPress={() => setWhen(w.offset)}>
                {w.label}
              </Chip>
            ))}
          </ChipRow>
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
