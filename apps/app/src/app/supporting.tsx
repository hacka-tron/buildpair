import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { type HoverState, SectionHeader, SpaceTile, UnreadDot } from "../components/kit";
import { PageHeader, Shell, useWide } from "../components/shell";
import { ErrorText } from "../components/ui";
import { authClient } from "../lib/auth";
import { useBlocked } from "../lib/blocks";
import { ago } from "../lib/format";
import { useSpaces, useSpaceViews } from "../lib/spaces";
import { checkIns, supportedRows } from "../lib/supporting";
import { colors, space } from "../lib/theme";
import { useUnread } from "../lib/unread";

/** Spaces other people share with you, and who could use a check-in. */
export default function Supporting() {
  const wide = useWide();
  const { data: session } = authClient.useSession();
  const userId = session?.user.id ?? "";
  const { spaces, error } = useSpaces();
  const blocked = useBlocked();
  const theirs = useMemo(() => (spaces ?? []).filter((s) => s.role === "supporter"), [spaces]);
  const ids = useMemo(() => theirs.map((s) => s.id), [theirs]);
  const views = useSpaceViews(ids, userId);
  const unread = useUnread(ids, views, userId, blocked);
  const [collapsed, setCollapsed] = useState(false);
  const quiet = checkIns(theirs, views);
  const rows = supportedRows(theirs, views, userId, blocked);
  const open = (id: string) => router.push({ pathname: "/spaces/[id]", params: { id } });

  return (
    <Shell active="supporting">
      <ScrollView
        contentContainerStyle={{
          padding: wide ? space.xxl : space.lg,
          paddingBottom: 120,
          maxWidth: 760,
          width: "100%",
          alignSelf: wide ? "flex-start" : "center",
          gap: space.md,
        }}
      >
        <PageHeader title="Supporting" sub="Spaces other people share with you" />
        <ErrorText>{error}</ErrorText>
        {spaces && rows.length === 0 ? (
          <Text style={{ fontSize: 14, color: colors.sub, lineHeight: 20 }}>
            Nobody has shared a space with you yet. When someone sends you an invite link and lets you in,
            their space shows up here.
          </Text>
        ) : null}
        {quiet.length ? (
          <View style={{ gap: space.sm }}>
            <SectionHeader open={!collapsed} onToggle={() => setCollapsed((c) => !c)}>
              {`Check in on · ${quiet.length}`}
            </SectionHeader>
            {!collapsed
              ? quiet.map((q) => (
                  <View
                    key={q.spaceId}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: space.md,
                      padding: space.md,
                      borderRadius: 12,
                      backgroundColor: colors.tint,
                    }}
                  >
                    <SpaceTile id={q.spaceId} name={q.spaceName} size={36} />
                    <Text style={{ flex: 1, fontSize: 14, color: colors.ink, lineHeight: 20 }}>
                      <Text style={{ fontWeight: "700" }}>{q.ownerName}</Text> · {q.spaceName} has been quiet
                      for {q.quietDays} days
                    </Text>
                    <Pressable onPress={() => open(q.spaceId)} accessibilityRole="button" hitSlop={8}>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: colors.blue }}>Check in</Text>
                    </Pressable>
                  </View>
                ))
              : null}
          </View>
        ) : null}
        {rows.map((r) => (
          <Pressable
            key={r.spaceId}
            accessibilityRole="link"
            onPress={() => open(r.spaceId)}
            style={({ hovered }: HoverState) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: space.md,
              paddingVertical: space.md,
              paddingHorizontal: space.sm,
              borderRadius: 10,
              backgroundColor: hovered ? "#F4F5F8" : "transparent",
            })}
          >
            <SpaceTile id={r.spaceId} name={r.spaceName} size={44} />
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <Text
                  numberOfLines={1}
                  style={{ flexShrink: 1, fontSize: 16, fontWeight: "700", color: colors.ink }}
                >
                  {r.spaceName}
                  {r.ownerName ? (
                    <Text style={{ fontWeight: "500", color: colors.sub }}>
                      {" "}
                      · {r.ownerName}
                      {r.othersCount ? ` + ${r.othersCount}` : ""}
                    </Text>
                  ) : null}
                </Text>
                <View style={{ flex: 1 }} />
                {r.last ? (
                  <Text style={{ fontSize: 12, color: unread.has(r.spaceId) ? colors.blue : colors.faint }}>
                    {ago(r.last.createdAt)}
                  </Text>
                ) : null}
                {unread.has(r.spaceId) ? <UnreadDot /> : null}
              </View>
              <Text numberOfLines={1} style={{ fontSize: 13, color: colors.sub }}>
                {r.last ? lastLine(r.lastBy, r.last.kind, r.last.body) : "Nothing here yet"}
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </Shell>
  );
}

function lastLine(who: string, kind: string, body: string): string {
  if (kind === "completion") return `${who} completed ${body}`;
  if (kind === "skip") return body ? `${who} skipped: ${body}` : `${who} skipped something`;
  if (kind === "update") return `${who} posted an update: ${body}`;
  return `${who}: ${body}`;
}
