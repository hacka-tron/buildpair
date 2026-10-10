import { newId, weekProgress } from "@buildpair/domain";
import type { Item, Message } from "@buildpair/protocol";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { ErrorText, Screen, styles } from "../../components/ui";
import { createInvite } from "../../lib/api";
import { authClient } from "../../lib/auth";
import { colors, radius, space } from "../../lib/theme";
import { useSpace } from "../../lib/use-space";

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function SpaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: session } = authClient.useSession();
  const userId = session?.user.id ?? "";
  const { sync, view, pendingIds, connected, online, error } = useSpace(id, userId);
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [showList, setShowList] = useState(wide);
  const [invite, setInvite] = useState("");

  const nameOf = (uid: string) => (uid === userId ? "You" : (view.members[uid]?.name ?? "Someone"));
  const openItems = useMemo(
    () => Object.values(view.items).filter((i) => i.status === "open" && !i.parentId),
    [view.items],
  );

  const makeInvite = async () => {
    try {
      setInvite((await createInvite(id)).url);
    } catch (e) {
      setInvite((e as Error).message);
    }
  };

  const listPanel = (
    <ItemsPanel
      items={openItems}
      spaceName={view.name}
      onToggle={(item) => sync.dispatch({ type: "item.complete", payload: { itemId: item.id, on: today() } })}
      onAdd={(title) =>
        sync.dispatch({ type: "item.create", payload: { itemId: newId(), kind: "todo", title } })
      }
    />
  );

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: space.md,
            paddingHorizontal: space.lg,
            paddingVertical: space.md,
            borderBottomWidth: 1,
            borderColor: colors.line,
          }}
        >
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
            accessibilityRole="button"
            accessibilityLabel="Back to spaces"
          >
            <Text style={{ fontSize: 22, color: colors.blue }}>‹</Text>
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.ink }} numberOfLines={1}>
              {view.name || "Loading…"}
            </Text>
            <Text style={styles.sub} numberOfLines={1}>
              {connected
                ? `${Object.keys(view.members).length} people · ${online.length} here now`
                : "Connecting… changes are saved and will send"}
            </Text>
          </View>
          {!wide ? (
            <Pressable onPress={() => setShowList((s) => !s)} accessibilityRole="button">
              <Text style={{ color: colors.blue, fontWeight: "600" }}>
                {showList ? "Hide list" : `List · ${openItems.length}`}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={makeInvite}
            accessibilityRole="button"
            style={{
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: radius.chip,
              paddingHorizontal: 10,
              paddingVertical: 6,
            }}
          >
            <Text style={{ color: colors.ink, fontWeight: "600", fontSize: 13 }}>Invite</Text>
          </Pressable>
        </View>
        {invite ? (
          <View style={{ backgroundColor: colors.tint, padding: space.md, gap: space.xs }}>
            <Text style={{ color: colors.noteInk, fontSize: 13 }}>
              Share this link. Anyone who opens it joins as a supporter:
            </Text>
            <Text selectable style={{ color: colors.noteInk, fontWeight: "600" }}>
              {invite}
            </Text>
          </View>
        ) : null}
        {error ? (
          <Pressable
            onPress={() => sync.dismissError()}
            style={{ padding: space.sm, paddingHorizontal: space.lg }}
          >
            <ErrorText>{error.reason} (tap to dismiss)</ErrorText>
          </Pressable>
        ) : null}

        <View style={{ flex: 1, flexDirection: wide ? "row" : "column" }}>
          {!wide && showList ? (
            <View style={{ maxHeight: 260, borderBottomWidth: 1, borderColor: colors.line }}>
              {listPanel}
            </View>
          ) : null}
          <Chat
            messages={view.messages}
            items={view.items}
            reactions={view.reactions}
            pendingIds={pendingIds}
            userId={userId}
            nameOf={nameOf}
            onReact={(messageId, emoji) =>
              sync.dispatch({ type: "reaction.toggle", payload: { messageId, emoji } })
            }
            onSend={(body) => sync.dispatch({ type: "message.send", payload: { messageId: newId(), body } })}
            onTyping={() => sync.typing()}
            spaceName={view.name}
          />
          {wide ? (
            <View
              style={{
                width: 300,
                borderLeftWidth: 1,
                borderColor: colors.line,
                backgroundColor: colors.surface,
              }}
            >
              {listPanel}
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Chat(props: {
  messages: Message[];
  items: Record<string, Item>;
  reactions: Record<string, Record<string, string[]>>;
  pendingIds: ReadonlySet<string>;
  userId: string;
  nameOf: (uid: string) => string;
  onReact: (messageId: string, emoji: string) => void;
  onSend: (body: string) => void;
  onTyping: () => void;
  spaceName: string;
}) {
  const [draft, setDraft] = useState("");
  const lastTyping = useRef(0);
  const data = useMemo(() => [...props.messages].reverse(), [props.messages]);
  const send = () => {
    const body = draft.trim();
    if (!body) return;
    props.onSend(body);
    setDraft("");
  };
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <FlatList
        inverted
        data={data}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{
          padding: space.lg,
          gap: space.md,
          maxWidth: 720,
          width: "100%",
          alignSelf: "center",
        }}
        ListEmptyComponent={
          <Text style={[styles.sub, { textAlign: "center", transform: [{ scaleY: -1 }] }]}>
            No messages yet. Say hello!
          </Text>
        }
        renderItem={({ item: m }) => (
          <MessageRow
            message={m}
            itemTitle={m.itemId ? props.items[m.itemId]?.title : undefined}
            author={props.nameOf(m.authorId)}
            mine={m.authorId === props.userId}
            pending={props.pendingIds.has(m.id)}
            reactions={props.reactions[m.id] ?? {}}
            userId={props.userId}
            onReact={(emoji) => props.onReact(m.id, emoji)}
          />
        )}
      />
      <View
        style={{
          flexDirection: "row",
          gap: space.sm,
          padding: space.md,
          borderTopWidth: 1,
          borderColor: colors.line,
          maxWidth: 720,
          width: "100%",
          alignSelf: "center",
        }}
      >
        <TextInput
          value={draft}
          onChangeText={(t) => {
            setDraft(t);
            if (Date.now() - lastTyping.current > 3000) {
              lastTyping.current = Date.now();
              props.onTyping();
            }
          }}
          placeholder={`Message ${props.spaceName || "the space"}…`}
          placeholderTextColor={colors.faint}
          onSubmitEditing={send}
          submitBehavior="submit"
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: radius.card,
            paddingHorizontal: space.md,
            paddingVertical: 10,
            fontSize: 15,
            color: colors.ink,
          }}
        />
        <Pressable
          onPress={send}
          accessibilityRole="button"
          style={{
            backgroundColor: colors.blue,
            borderRadius: radius.card,
            paddingHorizontal: space.lg,
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "600" }}>Send</Text>
        </Pressable>
      </View>
    </View>
  );
}

function MessageRow(props: {
  message: Message;
  itemTitle?: string;
  author: string;
  mine: boolean;
  pending: boolean;
  reactions: Record<string, string[]>;
  userId: string;
  onReact: (emoji: string) => void;
}) {
  const { message: m } = props;
  const chips = (
    <View style={{ flexDirection: "row", gap: 4, flexWrap: "wrap" }}>
      {Object.entries(props.reactions).map(([emoji, users]) => {
        const mine = users.includes(props.userId);
        return (
          <Pressable
            key={emoji}
            onPress={() => props.onReact(emoji)}
            style={{
              borderWidth: 1,
              borderColor: mine ? colors.royal : colors.line,
              backgroundColor: mine ? colors.tint : "#fff",
              borderRadius: 999,
              paddingHorizontal: 8,
              paddingVertical: 1,
            }}
          >
            <Text style={{ fontSize: 12, color: mine ? colors.blue : colors.sub }}>
              {emoji} {users.length}
            </Text>
          </Pressable>
        );
      })}
      {!props.reactions["🔥"] ? (
        <Pressable
          onPress={() => props.onReact("🔥")}
          style={{
            borderWidth: 1,
            borderStyle: "dashed",
            borderColor: colors.line,
            borderRadius: 999,
            paddingHorizontal: 8,
            paddingVertical: 1,
          }}
        >
          <Text style={{ fontSize: 12, color: colors.faint }}>+ 🔥</Text>
        </Pressable>
      ) : null}
    </View>
  );

  if (m.kind !== "text") {
    const verb =
      m.kind === "completion" ? "completed" : m.kind === "skip" ? "skipped" : "posted an update on";
    return (
      <View style={{ gap: 4, opacity: props.pending ? 0.6 : 1 }}>
        <Text style={{ fontSize: 13, color: colors.ink }}>
          {props.author} {verb} <Text style={{ fontWeight: "700" }}>{props.itemTitle ?? m.body}</Text>
        </Text>
        {m.kind !== "completion" && m.body ? (
          <View
            style={{ backgroundColor: colors.surface, borderRadius: 12, borderTopLeftRadius: 4, padding: 10 }}
          >
            <Text style={{ fontSize: 14, color: colors.ink }}>{m.body}</Text>
          </View>
        ) : null}
        {chips}
      </View>
    );
  }
  return (
    <View
      style={{ gap: 4, alignItems: props.mine ? "flex-end" : "flex-start", opacity: props.pending ? 0.6 : 1 }}
    >
      {!props.mine ? <Text style={{ fontSize: 11, color: colors.sub }}>{props.author}</Text> : null}
      <View
        style={{
          backgroundColor: props.mine ? colors.blue : colors.tint,
          borderRadius: 14,
          borderTopLeftRadius: props.mine ? 14 : 4,
          borderTopRightRadius: props.mine ? 4 : 14,
          paddingHorizontal: 12,
          paddingVertical: 9,
          maxWidth: 520,
        }}
      >
        <Text style={{ fontSize: 15, color: props.mine ? "#fff" : colors.noteInk }}>{m.body}</Text>
      </View>
      <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
        {chips}
        {props.pending ? <Text style={{ fontSize: 11, color: colors.faint }}>Sending…</Text> : null}
      </View>
    </View>
  );
}

function ItemsPanel(props: {
  items: Item[];
  spaceName: string;
  onToggle: (item: Item) => void;
  onAdd: (title: string) => void;
}) {
  const [title, setTitle] = useState("");
  const add = () => {
    if (!title.trim()) return;
    props.onAdd(title.trim());
    setTitle("");
  };
  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: 2 }}>
      <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ink, marginBottom: space.sm }}>
        In this space
      </Text>
      {props.items.length === 0 ? (
        <Text style={styles.sub}>Nothing open. Add the first thing below.</Text>
      ) : null}
      {props.items.map((item) => {
        const habit = item.kind === "habit" ? weekProgress(item, today()) : null;
        return (
          <Pressable
            key={item.id}
            onPress={() => props.onToggle(item)}
            accessibilityRole="checkbox"
            accessibilityLabel={`Mark ${item.title} done`}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: space.md,
              paddingVertical: 9,
              borderBottomWidth: 1,
              borderColor: colors.line,
            }}
          >
            <View
              style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: "#B4BAC8" }}
            />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, color: colors.ink }}>{item.title}</Text>
              {habit ? (
                <Text style={{ fontSize: 11, color: colors.sub }}>
                  {habit.done} of {habit.target} this week
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
      <TextInput
        value={title}
        onChangeText={setTitle}
        onSubmitEditing={add}
        placeholder={`+ Add to ${props.spaceName || "this space"}`}
        placeholderTextColor={colors.blue}
        style={{ paddingVertical: 9, fontSize: 14, color: colors.ink }}
      />
    </ScrollView>
  );
}
