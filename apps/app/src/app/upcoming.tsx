import { weekProgress } from "@buildpair/domain";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { ItemRow } from "../components/kit";
import { PageHeader, Shell, useWide } from "../components/shell";
import { ErrorText } from "../components/ui";
import { authClient } from "../lib/auth";
import { localToday } from "../lib/format";
import { applyChange, useSpaces, useSpaceViews } from "../lib/spaces";
import { colors, space } from "../lib/theme";
import { toggle, useHidden } from "../lib/ticks";
import { type DayEntry, upcoming } from "../lib/upcoming";

/** "Today", "Tomorrow", then "Monday, Oct 19". */
const dayTitle = (date: string, today: string, tomorrow: string) => {
  if (date === today) return "Today";
  if (date === tomorrow) return "Tomorrow";
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
};

/**
 * The next seven days as one agenda, the way Things and Todoist show Upcoming: late things first, then a
 * heading per day with that day's things under it as ordinary rows you can tick. Empty days stay as a
 * single quiet line so the week still reads in order.
 */
export default function Upcoming() {
  const wide = useWide();
  const today = localToday();
  const { data: session } = authClient.useSession();
  const userId = session?.user.id ?? "";
  const { spaces, error } = useSpaces();
  const ids = useMemo(() => (spaces ?? []).map((s) => s.id), [spaces]);
  const views = useSpaceViews(ids, userId);
  const hidden = useHidden();
  const [problem, setProblem] = useState("");
  const { days, habits } = upcoming(spaces ?? [], views, userId, today);
  const tomorrow = days[1]?.date ?? "";
  const shown = (entries: DayEntry[]) => entries.filter((e) => !hidden.has(e.item.id));
  const late = shown(days[0]?.entries.filter((e) => e.late) ?? []);

  const row = (e: DayEntry, last: boolean) => (
    <ItemRow
      key={e.item.id}
      item={e.item}
      today={today}
      last={last}
      quietToday
      meta={e.spaceName}
      onOpen={() =>
        router.push({
          pathname: "/spaces/[id]",
          params: { id: e.spaceId, item: e.item.parentId ?? e.item.id },
        })
      }
      onToggle={() => setProblem(toggle(e.item, today, (c) => applyChange(e.spaceId, userId, c)) ?? "")}
    />
  );

  return (
    <Shell active="upcoming" tabs={!wide ? false : undefined}>
      <ScrollView
        contentContainerStyle={{
          padding: wide ? space.xxl : space.lg,
          paddingBottom: 80,
          maxWidth: 760,
          width: "100%",
          alignSelf: wide ? "flex-start" : "center",
        }}
      >
        {!wide ? (
          <Text
            onPress={() => router.back()}
            style={{ fontSize: 14, color: colors.blue, marginBottom: space.sm }}
          >
            ‹ Back
          </Text>
        ) : null}
        <PageHeader title="Upcoming" sub="The next seven days, across your spaces" />
        <ErrorText>{error || problem}</ErrorText>

        {late.length ? (
          <View style={{ marginTop: space.lg }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.danger }}>Overdue</Text>
            {late.map((e, i) => row(e, i === late.length - 1))}
          </View>
        ) : null}

        {days.map((d) => {
          const entries = shown(d.entries.filter((e) => !e.late));
          const title = dayTitle(d.date, today, tomorrow);
          return (
            <View
              key={d.date}
              style={{
                marginTop: space.lg,
                paddingTop: space.sm,
                borderTopWidth: 1,
                borderColor: colors.line,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm }}>
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: "700",
                    color: d.date === today ? colors.blue : colors.ink,
                  }}
                >
                  {title}
                </Text>
                {entries.length ? (
                  <Text style={{ fontSize: 12, color: colors.faint }}>{entries.length}</Text>
                ) : (
                  <Text style={{ fontSize: 13, color: colors.faint }}>Nothing planned</Text>
                )}
              </View>
              {entries.map((e, i) => row(e, i === entries.length - 1))}
            </View>
          );
        })}

        {habits.length ? (
          <View style={{ marginTop: space.xl }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.ink }}>Habits this week</Text>
            {habits.map((h, i) => {
              const p = weekProgress(h.item, today);
              return (
                <ItemRow
                  key={h.item.id}
                  item={h.item}
                  today={today}
                  last={i === habits.length - 1}
                  meta={`${h.spaceName} · ${p.done} of ${p.target} this week`}
                  onOpen={() =>
                    router.push({ pathname: "/spaces/[id]", params: { id: h.spaceId, item: h.item.id } })
                  }
                  onToggle={() =>
                    setProblem(toggle(h.item, today, (c) => applyChange(h.spaceId, userId, c)) ?? "")
                  }
                />
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </Shell>
  );
}
