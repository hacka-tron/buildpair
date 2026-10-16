import { router } from "expo-router";
import { useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { type HoverState, SpaceTile } from "../components/kit";
import { PageHeader, Shell, useWide } from "../components/shell";
import { ErrorText } from "../components/ui";
import { authClient } from "../lib/auth";
import { localToday, timeLabel } from "../lib/format";
import { useSpaces, useSpaceViews } from "../lib/spaces";
import { colors, radius, space } from "../lib/theme";
import { type DayEntry, upcoming } from "../lib/upcoming";

const dayName = (date: string, today: string) => {
  if (date === today) return "Today";
  const d = new Date(`${date}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
};

/** The next seven days of your dated things, across every space. */
export default function Upcoming() {
  const wide = useWide();
  const today = localToday();
  const { data: session } = authClient.useSession();
  const userId = session?.user.id ?? "";
  const { spaces, error } = useSpaces();
  const ids = useMemo(() => (spaces ?? []).map((s) => s.id), [spaces]);
  const views = useSpaceViews(ids, userId);
  const { days, habits } = upcoming(spaces ?? [], views, userId, today);
  const open = (e: DayEntry) =>
    router.push({ pathname: "/spaces/[id]", params: { id: e.spaceId, item: e.item.parentId ?? e.item.id } });
  const row = (e: DayEntry) => (
    <Pressable
      key={e.item.id}
      onPress={() => open(e)}
      accessibilityRole="link"
      style={({ hovered }: HoverState) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        padding: 8,
        borderRadius: radius.control,
        backgroundColor: hovered ? colors.surface : colors.card,
        borderWidth: 1,
        borderColor: colors.line,
      })}
    >
      <SpaceTile id={e.spaceId} name={e.spaceName} size={16} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={2} style={{ fontSize: 13, color: colors.ink }}>
          {e.item.title}
        </Text>
        {e.late || e.item.dueTime ? (
          <Text style={{ fontSize: 11, color: e.late ? "#C0392B" : colors.sub }}>
            {e.late ? "Late" : timeLabel(e.item.dueTime!)}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );

  return (
    <Shell active="upcoming" tabs={!wide ? false : undefined}>
      <ScrollView
        contentContainerStyle={{
          padding: wide ? space.xxl : space.lg,
          paddingBottom: 60,
          gap: space.md,
          width: "100%",
        }}
      >
        {!wide ? (
          <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={8}>
            <Text style={{ fontSize: 14, color: colors.blue }}>‹ Back</Text>
          </Pressable>
        ) : null}
        <PageHeader title="Upcoming" sub="The next seven days, across your spaces" />
        <ErrorText>{error}</ErrorText>
        {habits.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, alignItems: "center" }}>
            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.sub }}>Habits</Text>
            {habits.map((h) => (
              <Pressable
                key={h.item.id}
                onPress={() => open(h)}
                accessibilityRole="link"
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  borderWidth: 1,
                  borderColor: colors.line,
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                }}
              >
                <SpaceTile id={h.spaceId} name={h.spaceName} size={14} />
                <Text style={{ fontSize: 13, color: colors.ink }}>
                  {h.item.title} · {h.item.timesPerWeek}x a week
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <View style={{ flexDirection: wide ? "row" : "column", gap: space.md, alignItems: "stretch" }}>
          {days.map((d) => (
            <View key={d.date} style={{ flex: wide ? 1 : undefined, minWidth: 0, gap: space.sm }}>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "700",
                  color: d.date === today ? colors.blue : colors.sub,
                  textTransform: "uppercase",
                }}
              >
                {dayName(d.date, today)}
              </Text>
              {d.entries.length ? (
                d.entries.map(row)
              ) : (
                <Text style={{ fontSize: 12, color: colors.faint }}>Nothing due</Text>
              )}
            </View>
          ))}
        </View>
      </ScrollView>
    </Shell>
  );
}
