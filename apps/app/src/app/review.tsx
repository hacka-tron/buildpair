import { newId, reflectionDue } from "@buildpair/domain";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Card, SpaceTile } from "../components/kit";
import { PageHeader, Shell, useWide } from "../components/shell";
import { Button, ErrorText } from "../components/ui";
import { authClient } from "../lib/auth";
import { applyChange, useSpaces, useSpaceViews } from "../lib/spaces";
import { colors, radius, space } from "../lib/theme";

const WEEK = 7 * 86_400_000;

/** Every space due a reflection, one after another. */
export default function Review() {
  const wide = useWide();
  const { data: session } = authClient.useSession();
  const userId = session?.user.id ?? "";
  const { spaces } = useSpaces();
  const ids = useMemo(() => (spaces ?? []).map((s) => s.id), [spaces]);
  const views = useSpaceViews(ids, userId);
  // Fixed when the review starts, so posting one doesn't reshuffle the rest.
  const [queue, setQueue] = useState<string[] | null>(null);
  const due = (spaces ?? [])
    .filter((s) => views[s.id] && reflectionDue(views[s.id]!, userId, new Date()))
    .map((s) => s.id);
  const list = queue ?? due;
  const [index, setIndex] = useState(0);
  const [wins, setWins] = useState("");
  const [blockers, setBlockers] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState("");
  const spaceId = list[index];
  const view = spaceId ? views[spaceId] : undefined;

  const stats = useMemo(() => {
    if (!view) return { done: 0, skipped: 0 };
    const since = new Date(Date.now() - WEEK).toISOString().slice(0, 10);
    const mine = Object.values(view.items).filter((i) => i.ownerId === userId);
    return {
      done: mine.reduce((n, i) => n + i.doneOn.filter((d) => d >= since).length, 0),
      skipped: mine.reduce((n, i) => n + i.skippedOn.filter((d) => d >= since).length, 0),
    };
  }, [view, userId]);

  const advance = () => {
    if (!queue) setQueue(list);
    setWins("");
    setBlockers("");
    setNext("");
    setError("");
    setIndex((i) => i + 1);
  };
  const post = () => {
    if (!spaceId) return;
    const problem = applyChange(spaceId, userId, {
      type: "reflection.post",
      payload: { messageId: newId(), wins: wins.trim(), blockers: blockers.trim(), next: next.trim() },
    });
    if (problem) return setError(problem);
    advance();
  };
  const field = (label: string, value: string, set: (v: string) => void) => (
    <View style={{ gap: 4 }}>
      <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ink }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={set}
        multiline
        maxLength={1000}
        style={{
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: radius.control,
          paddingHorizontal: space.md,
          paddingVertical: 10,
          fontSize: 16,
          minHeight: 64,
          textAlignVertical: "top",
          color: colors.ink,
          outlineColor: colors.royal,
          backgroundColor: "#fff",
        }}
      />
    </View>
  );

  return (
    <Shell active="review" tabs={false}>
      <ScrollView
        contentContainerStyle={{
          padding: wide ? space.xxl : space.lg,
          paddingBottom: 60,
          gap: space.md,
          maxWidth: 760,
          width: "100%",
          alignSelf: wide ? "flex-start" : "center",
        }}
      >
        {!wide ? (
          <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={8}>
            <Text style={{ fontSize: 14, color: colors.blue }}>‹ Back</Text>
          </Pressable>
        ) : null}
        <PageHeader
          title="Weekly review"
          sub={
            list.length
              ? `${Math.min(index + 1, list.length)} of ${list.length} · shared spaces only`
              : undefined
          }
        />
        {!spaceId ? (
          <>
            <Text style={{ fontSize: 15, color: colors.ink }}>
              {list.length
                ? "That's everything for this week. Nice work."
                : "Nothing to review right now. Reviews open Friday to Monday for spaces where you have something shared, once a week."}
            </Text>
            <Button label="Back to Today" kind="secondary" onPress={() => router.replace("/")} />
          </>
        ) : (
          <Card>
            <View style={{ gap: space.md }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
                <SpaceTile id={spaceId} name={view?.name ?? ""} size={32} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 17, fontWeight: "700", color: colors.ink }}>{view?.name}</Text>
                  <Text style={{ fontSize: 13, color: colors.sub }}>
                    This week: {stats.done} done · {stats.skipped} skipped
                  </Text>
                </View>
              </View>
              {field("How did the week go?", wins, setWins)}
              {field("Where are you stuck?", blockers, setBlockers)}
              {field("One thing for next week", next, setNext)}
              <ErrorText>{error}</ErrorText>
              <View style={{ flexDirection: "row", gap: space.sm }}>
                <View style={{ flex: 1 }}>
                  <Button label="Skip this space" kind="secondary" onPress={advance} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    label={index + 1 < list.length ? "Post and go on" : "Post"}
                    onPress={post}
                    disabled={!wins.trim() && !blockers.trim() && !next.trim()}
                  />
                </View>
              </View>
              <Text style={{ fontSize: 12, color: colors.faint }}>
                Posts to the space's chat, where its supporters can reply.
              </Text>
            </View>
          </Card>
        )}
      </ScrollView>
    </Shell>
  );
}
