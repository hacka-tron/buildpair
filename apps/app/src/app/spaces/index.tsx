import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import type { HoverState } from "../../components/kit";
import { Fab, Faces, Sheet, SpaceTile, Tag } from "../../components/kit";
import { PageHeader, Shell, signOut, useWide } from "../../components/shell";
import { Button, ErrorText, Field } from "../../components/ui";
import { authClient } from "../../lib/auth";
import { ago } from "../../lib/format";
import { addSpace, refreshSpaces, useSpaces, useSpaceViews } from "../../lib/spaces";
import { colors, space } from "../../lib/theme";

export default function Spaces() {
  const wide = useWide();
  const params = useLocalSearchParams<{ new?: string }>();
  const { data: session } = authClient.useSession();
  const userId = session?.user.id ?? "";
  const { spaces, error } = useSpaces();
  const ids = useMemo(() => (spaces ?? []).map((s) => s.id), [spaces]);
  const views = useSpaceViews(ids, userId);
  const [creating, setCreating] = useState(params.new === "1");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (params.new === "1") setCreating(true);
  }, [params.new]);

  // Most recent activity first, like a chat list.
  // Spaces others share with you live on the Supporting tab.
  const rows = (spaces ?? [])
    .filter((s) => s.role === "owner")
    .map((s) => {
      const view = views[s.id];
      const items = Object.values(view?.items ?? {}).filter((i) => !i.parentId);
      const open = items.filter((i) => i.status === "open");
      const last = view?.messages[view.messages.length - 1];
      const people = Object.values(view?.members ?? {}).map((m) => ({ id: m.userId, name: m.name }));
      return { s, open, last, people };
    })
    .sort((a, b) => (b.last?.createdAt ?? "").localeCompare(a.last?.createdAt ?? ""));

  return (
    <Shell active="spaces">
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await refreshSpaces();
              setRefreshing(false);
            }}
          />
        }
        contentContainerStyle={{
          padding: wide ? space.xxl : space.lg,
          paddingBottom: 120,
          maxWidth: 760,
          width: "100%",
          alignSelf: wide ? "flex-start" : "center",
        }}
      >
        <PageHeader
          title="Spaces"
          right={
            wide ? (
              <Button label="New space" onPress={() => setCreating(true)} />
            ) : (
              <Pressable onPress={signOut} accessibilityRole="button" hitSlop={10} style={{ paddingTop: 10 }}>
                <Text style={{ fontSize: 13, color: colors.sub }}>Sign out</Text>
              </Pressable>
            )
          }
        />
        <ErrorText>{error}</ErrorText>
        {spaces && spaces.length === 0 ? (
          <Text style={{ fontSize: 14, color: colors.sub, lineHeight: 20, marginTop: space.md }}>
            No spaces yet. Make one for something you're working on, then invite someone to keep you honest.
          </Text>
        ) : null}
        {rows.map(({ s, open, last, people }) => (
          <Pressable
            key={s.id}
            onPress={() => router.push({ pathname: "/spaces/[id]", params: { id: s.id } })}
            accessibilityRole="link"
            style={({ hovered }: HoverState) => ({
              flexDirection: "row",
              gap: space.md,
              paddingVertical: 14,
              paddingHorizontal: wide ? space.md : 0,
              borderBottomWidth: 1,
              borderColor: colors.line,
              borderRadius: wide ? 10 : 0,
              backgroundColor: hovered ? colors.surface : "transparent",
            })}
          >
            <SpaceTile id={s.id} name={s.name} size={44} />
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <Text
                  numberOfLines={1}
                  style={{ flexShrink: 1, fontSize: 16, fontWeight: "700", color: colors.ink }}
                >
                  {s.name}
                </Text>
                {s.requests ? (
                  <Tag tone="blue">{`${s.requests} ${s.requests === 1 ? "request" : "requests"}`}</Tag>
                ) : null}
                <View style={{ flex: 1 }} />
                {last ? (
                  <Text style={{ fontSize: 12, color: colors.faint }}>{ago(last.createdAt)}</Text>
                ) : null}
              </View>
              <Text numberOfLines={1} style={{ fontSize: 13, color: colors.sub }}>
                {summary(open.length, s.purpose)}
              </Text>
              {people.length > 1 ? <Faces people={people} size={20} max={5} /> : null}
            </View>
          </Pressable>
        ))}
      </ScrollView>
      {!wide ? <Fab label="New space" onPress={() => setCreating(true)} /> : null}
      <NewSpace
        visible={creating}
        wide={wide}
        onClose={() => {
          setCreating(false);
          if (params.new) router.setParams({ new: undefined });
        }}
      />
    </Shell>
  );
}

function summary(open: number, purpose: string) {
  const left = open === 0 ? "Nothing open" : `${open} ${open === 1 ? "thing" : "things"} open`;
  return `${left} · ${purpose}`;
}

function NewSpace({ visible, wide, onClose }: { visible: boolean; wide: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const create = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const created = await addSpace(name.trim(), purpose.trim());
      setName("");
      setPurpose("");
      onClose();
      router.push({ pathname: "/spaces/[id]", params: { id: created.id } });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="New space" wide={wide}>
      <Field label="Name" value={name} onChangeText={setName} placeholder="Life" maxLength={60} autoFocus />
      <Field
        label="What it's for"
        value={purpose}
        onChangeText={setPurpose}
        placeholder="Family, health and the house"
        maxLength={280}
        onSubmitEditing={create}
      />
      <ErrorText>{error}</ErrorText>
      <Button label="Create space" onPress={create} busy={busy} disabled={!name.trim() || !purpose.trim()} />
    </Sheet>
  );
}
