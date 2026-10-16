import { router } from "expo-router";
import { useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { type HoverState, SpaceTile } from "../components/kit";
import { PageHeader, Shell, useWide } from "../components/shell";
import { ErrorText } from "../components/ui";
import { authClient } from "../lib/auth";
import { useBlocked } from "../lib/blocks";
import { ago } from "../lib/format";
import { useSpaces, useSpaceViews } from "../lib/spaces";
import { activity, namesLine } from "../lib/supporting";
import { colors, space } from "../lib/theme";

/** What's aimed at you: people asking to join your spaces, and reactions to what you said. */
export default function Activity() {
  const wide = useWide();
  const { data: session } = authClient.useSession();
  const userId = session?.user.id ?? "";
  const { spaces, error } = useSpaces();
  const blocked = useBlocked();
  const ids = useMemo(() => (spaces ?? []).map((s) => s.id), [spaces]);
  const views = useSpaceViews(ids, userId);
  const entries = activity(spaces ?? [], views, userId, blocked);
  const open = (id: string) => router.push({ pathname: "/spaces/[id]", params: { id } });

  return (
    <Shell active="activity" tabs={false}>
      <ScrollView
        contentContainerStyle={{
          padding: wide ? space.xxl : space.lg,
          paddingBottom: 60,
          maxWidth: 760,
          width: "100%",
          alignSelf: wide ? "flex-start" : "center",
          gap: space.xs,
        }}
      >
        {!wide ? (
          <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={8}>
            <Text style={{ fontSize: 14, color: colors.blue, paddingBottom: space.sm }}>‹ Back</Text>
          </Pressable>
        ) : null}
        <PageHeader title="Activity" sub="Requests and reactions aimed at you" />
        <ErrorText>{error}</ErrorText>
        {spaces && entries.length === 0 ? (
          <Text style={{ fontSize: 14, color: colors.sub }}>
            Nothing new. Reactions to what you say show up here.
          </Text>
        ) : null}
        {entries.map((e) => (
          <Pressable
            key={e.kind === "requests" ? `req-${e.spaceId}` : e.message.id}
            accessibilityRole="link"
            onPress={() => open(e.spaceId)}
            style={({ hovered }: HoverState) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: space.md,
              paddingVertical: space.md,
              paddingHorizontal: space.sm,
              borderRadius: 10,
              backgroundColor: hovered ? colors.hover : "transparent",
            })}
          >
            <SpaceTile id={e.spaceId} name={e.spaceName} size={36} />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              {e.kind === "requests" ? (
                <Text style={{ fontSize: 14, color: colors.ink }}>
                  <Text style={{ fontWeight: "700" }}>
                    {e.count} {e.count === 1 ? "person" : "people"}
                  </Text>{" "}
                  asking to join {e.spaceName}
                </Text>
              ) : (
                <>
                  <Text style={{ fontSize: 14, color: colors.ink }}>
                    {e.byEmoji.map(([emoji, names]) => `${namesLine(names)} reacted ${emoji}`).join(" · ")}
                  </Text>
                  <Text numberOfLines={1} style={{ fontSize: 13, color: colors.sub }}>
                    {e.message.kind === "reflection" ? "Your weekly reflection" : `"${e.message.body}"`} ·{" "}
                    {e.spaceName} · {ago(e.message.createdAt)}
                  </Text>
                </>
              )}
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </Shell>
  );
}
