import { newId, parseQuickAdd, type SpaceState, weekProgress } from "@buildpair/domain";
import type { Item, Message } from "@buildpair/protocol";
import type { Change } from "@buildpair/sync";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Text,
  TextInput,
  View,
} from "react-native";
import { ItemSheet } from "../../components/item-sheet";
import { Avatar, Card, Faces, Icon, ItemRow, SectionHeader, Sheet, SpaceTile } from "../../components/kit";
import { SelectionBar, useSelection } from "../../components/selection";
import { Shell, useWide } from "../../components/shell";
import { Button, ErrorText } from "../../components/ui";
import { createInvite } from "../../lib/api";
import { authClient } from "../../lib/auth";
import { ago, localToday, peopleLine } from "../../lib/format";
import { applyChange, useSpaces } from "../../lib/spaces";
import { colors, radius, space } from "../../lib/theme";
import { useSpace } from "../../lib/use-space";

const REACTIONS = ["🔥", "👏", "❤️", "🙌", "😂"];

export default function SpaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const wide = useWide();
  const today = localToday();
  const { data: session } = authClient.useSession();
  const userId = session?.user.id ?? "";
  const { sync, view, pendingIds, connected, online, error } = useSpace(id, userId);
  const { spaces } = useSpaces();
  const summary = spaces?.find((s) => s.id === id);
  const name = view.name || summary?.name || "";
  const purpose = view.purpose || summary?.purpose || "";
  const [inviting, setInviting] = useState(false);
  const [opened, setOpened] = useState<Item | null>(null);

  const nameOf = (uid: string) => (uid === userId ? "You" : (view.members[uid]?.name ?? "Someone"));
  const members = Object.values(view.members);
  const others = members.filter((m) => m.userId !== userId);
  const items = useMemo(() => Object.values(view.items).filter((i) => !i.parentId), [view.items]);
  const open = items.filter((i) => i.status === "open");
  const doneCount = items.length - open.length;

  const [notice, setNotice] = useState("");
  const run = (change: Change): boolean => {
    const problem = applyChange(id, userId, change);
    setNotice(problem ?? "");
    return problem === null;
  };
  const complete = (item: Item) => run({ type: "item.complete", payload: { itemId: item.id, on: today } });
  // "+ Add to <space>" reads plain words the same way quick add does ("gym 4x a week", "rent friday").
  const add = (text: string) => {
    const p = parseQuickAdd(text, today);
    return run({
      type: "item.create",
      payload: {
        itemId: newId(),
        kind: p.kind,
        title: p.title,
        dueOn: p.dueOn,
        dueTime: p.dueTime,
        timesPerWeek: p.timesPerWeek,
      },
    });
  };
  const selection = useSelection();

  const status = connected
    ? online.filter((u) => u !== userId).length
      ? `${online.filter((u) => u !== userId).length} here now`
      : ""
    : "Connecting… your changes are saved and will send";

  const itemsPanel = (
    <ItemsPanel
      items={open}
      doneCount={doneCount}
      spaceName={name}
      today={today}
      view={view}
      onToggle={complete}
      onOpen={setOpened}
      onAdd={add}
      wide={wide}
      selectionFor={(item) => selection.rowProps(item, id, userId)}
    />
  );

  const chat = (
    <Chat
      view={view}
      pendingIds={pendingIds}
      userId={userId}
      nameOf={nameOf}
      spaceName={name}
      header={wide ? undefined : itemsPanel}
      onReact={(messageId, emoji) => run({ type: "reaction.toggle", payload: { messageId, emoji } })}
      onSend={(body) => run({ type: "message.send", payload: { messageId: newId(), body } })}
      onTyping={() => sync.typing()}
    />
  );

  const problem = error?.reason ?? notice;
  const errorBar = problem ? (
    <Pressable
      onPress={() => {
        sync.dismissError();
        setNotice("");
      }}
      accessibilityRole="button"
      style={{ paddingVertical: space.sm, paddingHorizontal: space.lg, backgroundColor: "#FDECEA" }}
    >
      <ErrorText>{problem} Tap to dismiss.</ErrorText>
    </Pressable>
  ) : null;

  const inviteSheet = (
    <InviteSheet
      spaceId={id}
      spaceName={name}
      visible={inviting}
      wide={wide}
      onClose={() => setInviting(false)}
    />
  );

  const sheets = (
    <>
      <ItemSheet
        key={opened?.id ?? "none"}
        item={opened}
        view={view}
        userId={userId}
        today={today}
        wide={wide}
        onClose={() => setOpened(null)}
        apply={(change) => applyChange(id, userId, change)}
      />
      {inviteSheet}
      {selection.active ? (
        <SelectionBar
          picked={selection.picked}
          today={today}
          wide={wide}
          onClear={selection.clear}
          apply={(spaceId, change) => applyChange(spaceId, userId, change)}
        />
      ) : null}
    </>
  );

  if (wide) {
    return (
      <Shell active={{ spaceId: id }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: space.md,
            paddingHorizontal: space.xl,
            paddingVertical: space.lg,
            borderBottomWidth: 1,
            borderColor: colors.line,
          }}
        >
          <SpaceTile id={id} name={name || "?"} size={40} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontSize: 19, fontWeight: "700", color: colors.ink }}>
              {name || "Loading…"}
            </Text>
            <Text numberOfLines={1} style={{ fontSize: 13, color: colors.sub }}>
              {purpose}
              {members.length ? ` · ${members.length} ${members.length === 1 ? "person" : "people"}` : ""}
              {status ? ` · ${status}` : ""}
            </Text>
          </View>
          <Button label="Invite" kind="secondary" onPress={() => setInviting(true)} />
        </View>
        {errorBar}
        <View style={{ flex: 1, flexDirection: "row" }}>
          <View style={{ flex: 1, minWidth: 0 }}>{chat}</View>
          <ScrollView
            style={{ width: 330, flexGrow: 0, borderLeftWidth: 1, borderColor: colors.line }}
            contentContainerStyle={{ padding: space.xl, gap: space.xl }}
          >
            {itemsPanel}
            <People members={members} online={online} userId={userId} onInvite={() => setInviting(true)} />
          </ScrollView>
        </View>
        {sheets}
      </Shell>
    );
  }

  return (
    <Shell active={{ spaceId: id }} tabs={false}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.md, gap: 4 }}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/spaces"))}
            accessibilityRole="button"
            accessibilityLabel="Back to spaces"
            hitSlop={10}
            style={{
              flexDirection: "row",
              alignItems: "center",
              alignSelf: "flex-start",
              paddingVertical: 4,
            }}
          >
            <Icon name="chevron-left" size={18} color={colors.sub} />
            <Text style={{ fontSize: 14, color: colors.sub }}>Spaces</Text>
          </Pressable>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            <Text
              numberOfLines={1}
              style={{ flex: 1, fontSize: 28, fontWeight: "800", letterSpacing: -0.6, color: colors.ink }}
            >
              {name || "Loading…"}
            </Text>
            {others.length ? (
              <Faces people={others.map((m) => ({ id: m.userId, name: m.name }))} size={26} />
            ) : null}
            <Pressable
              onPress={() => setInviting(true)}
              accessibilityRole="button"
              accessibilityLabel="Invite people"
              hitSlop={8}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: colors.line,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="user-plus" size={16} color={colors.ink} />
            </Pressable>
          </View>
          <Text numberOfLines={1} style={{ fontSize: 13, color: colors.sub }}>
            {peopleLine(["You", ...others.map((m) => m.name)])}
            {status ? ` · ${status}` : ""}
          </Text>
        </View>
        {errorBar}
        {chat}
      </KeyboardAvoidingView>
      {sheets}
    </Shell>
  );
}

function ItemsPanel(props: {
  items: Item[];
  doneCount: number;
  spaceName: string;
  today: string;
  view: SpaceState;
  onToggle: (item: Item) => void;
  onOpen: (item: Item) => void;
  /** Returns false when the change didn't go through, so the text stays for another try. */
  onAdd: (title: string) => boolean;
  wide: boolean;
  selectionFor: (item: Item) => { active: boolean; selected: boolean; onSelect?: () => void };
}) {
  const [open, setOpen] = useState(true);
  const [title, setTitle] = useState("");
  const add = () => {
    if (!title.trim()) return;
    if (props.onAdd(title.trim())) setTitle("");
  };
  const body = (
    <>
      {props.items.length === 0 ? (
        <Text style={{ fontSize: 13, color: colors.faint, paddingVertical: space.md }}>
          Nothing open. Add the first thing below.
        </Text>
      ) : null}
      {props.items.map((item) => (
        <ItemRow
          key={item.id}
          item={item}
          today={props.today}
          onToggle={() => props.onToggle(item)}
          onOpen={() => props.onOpen(item)}
          meta={itemMeta(item, props.today, props.view)}
          selection={props.selectionFor(item)}
        />
      ))}
      {props.doneCount ? (
        <Text
          style={{
            fontSize: 13,
            color: colors.sub,
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderColor: colors.line,
          }}
        >
          Done · {props.doneCount}
        </Text>
      ) : null}
      <TextInput
        value={title}
        onChangeText={setTitle}
        onSubmitEditing={add}
        submitBehavior="submit"
        placeholder={`+ Add to ${props.spaceName || "this space"}`}
        placeholderTextColor={colors.blue}
        accessibilityLabel={`Add to ${props.spaceName}`}
        style={{
          paddingVertical: 12,
          fontSize: 16,
          color: colors.ink,
          fontWeight: "500",
          outlineColor: colors.royal,
        }}
      />
    </>
  );
  return (
    <View style={{ paddingHorizontal: props.wide ? 0 : space.lg, paddingBottom: props.wide ? 0 : space.md }}>
      <SectionHeader
        open={open}
        onToggle={() => setOpen((o) => !o)}
        right={<Text style={{ fontSize: 12, color: colors.faint }}>{props.items.length} open</Text>}
      >
        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ink }}>In this space</Text>
      </SectionHeader>
      {open ? props.wide ? <View>{body}</View> : <Card>{body}</Card> : null}
      {!props.wide ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.lg }}>
          <Icon name="chevron-down" size={14} color={colors.faint} />
          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ink }}>Chat</Text>
        </View>
      ) : null}
    </View>
  );
}

function itemMeta(item: Item, today: string, view: SpaceState): string | undefined {
  if (item.kind === "habit") {
    const p = weekProgress(item, today);
    return `${p.done} of ${p.target} this week`;
  }
  if (item.kind === "goal") {
    const steps = Object.values(view.items).filter((i) => i.parentId === item.id);
    return `${steps.filter((i) => i.status === "done").length} of ${steps.length} steps`;
  }
  return undefined;
}

function People(props: {
  members: { userId: string; name: string; role: string }[];
  online: readonly string[];
  userId: string;
  onInvite: () => void;
}) {
  return (
    <View style={{ gap: space.sm }}>
      <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ink }}>People</Text>
      {props.members.map((m) => {
        const here = props.online.includes(m.userId);
        return (
          <View
            key={m.userId}
            style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 }}
          >
            <Avatar id={m.userId} name={m.name} size={28} online={here} />
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: colors.ink }}>
              {m.userId === props.userId ? `${m.name} (you)` : m.name}
            </Text>
            <Text style={{ fontSize: 12, color: here ? colors.online : colors.faint }}>
              {here ? "Here now" : m.role === "owner" ? "Owner" : "Supporter"}
            </Text>
          </View>
        );
      })}
      <Pressable onPress={props.onInvite} accessibilityRole="button" style={{ paddingVertical: 6 }}>
        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.blue }}>+ Invite people</Text>
      </Pressable>
    </View>
  );
}

type Row = { kind: "message"; message: Message } | { kind: "day"; label: string; key: string };

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = localToday();
  const day = localToday(d);
  if (day === today) return "Today";
  if (day === localToday(new Date(Date.now() - 86400000))) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

function Chat(props: {
  view: SpaceState;
  pendingIds: ReadonlySet<string>;
  userId: string;
  nameOf: (uid: string) => string;
  spaceName: string;
  header?: React.ReactElement;
  onReact: (messageId: string, emoji: string) => void;
  /** Returns false when the message didn't go through, so the draft stays. */
  onSend: (body: string) => boolean;
  onTyping: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [picker, setPicker] = useState<string | null>(null);
  const lastTyping = useRef(0);
  const rows = useMemo(() => {
    const out: Row[] = [];
    let lastDay = "";
    for (const m of props.view.messages) {
      const day = localToday(new Date(m.createdAt));
      if (day !== lastDay) {
        out.push({ kind: "day", label: dayLabel(m.createdAt), key: `day-${day}` });
        lastDay = day;
      }
      out.push({ kind: "message", message: m });
    }
    return out.reverse();
  }, [props.view.messages]);
  const send = () => {
    const body = draft.trim();
    if (!body) return;
    if (props.onSend(body)) setDraft("");
  };
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <FlatList
        inverted
        data={rows}
        extraData={[picker, props.pendingIds, props.view.reactions, props.view.items, props.userId]}
        keyExtractor={(r) => (r.kind === "day" ? r.key : r.message.id)}
        ListFooterComponent={props.header}
        contentContainerStyle={{ paddingVertical: space.md }}
        ListEmptyComponent={
          <Text style={{ fontSize: 13, color: colors.faint, textAlign: "center", padding: space.xl }}>
            No messages yet. Say hello, or tick something off to post it here.
          </Text>
        }
        renderItem={({ item: r }) =>
          r.kind === "day" ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: space.md,
                paddingHorizontal: space.lg,
                paddingVertical: space.md,
              }}
            >
              <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
              <Text style={{ fontSize: 12, color: colors.sub }}>{r.label}</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
            </View>
          ) : (
            <MessageRow
              message={r.message}
              itemTitle={r.message.itemId ? props.view.items[r.message.itemId]?.title : undefined}
              author={props.nameOf(r.message.authorId)}
              authorName={props.view.members[r.message.authorId]?.name ?? "Someone"}
              pending={props.pendingIds.has(r.message.id)}
              reactions={props.view.reactions[r.message.id] ?? {}}
              userId={props.userId}
              picking={picker === r.message.id}
              onPick={() => setPicker((p) => (p === r.message.id ? null : r.message.id))}
              onReact={(emoji) => {
                setPicker(null);
                props.onReact(r.message.id, emoji);
              }}
            />
          )
        }
      />
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: space.sm,
          padding: space.md,
          borderTopWidth: 1,
          borderColor: colors.line,
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
            borderRadius: 999,
            paddingHorizontal: space.lg,
            paddingVertical: 11,
            fontSize: 16,
            color: colors.ink,
            backgroundColor: "#fff",
            outlineColor: colors.royal,
          }}
        />
        <Pressable
          onPress={send}
          disabled={!draft.trim()}
          accessibilityRole="button"
          accessibilityLabel="Send"
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor: draft.trim() ? colors.royal : colors.line,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="arrow-up" size={20} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

function MessageRow(props: {
  message: Message;
  itemTitle?: string;
  author: string;
  /** The author's real name, for their avatar (author says "You" for your own). */
  authorName: string;
  pending: boolean;
  reactions: Record<string, string[]>;
  userId: string;
  picking: boolean;
  onPick: () => void;
  onReact: (emoji: string) => void;
}) {
  const { message: m } = props;
  const [hovered, setHovered] = useState(false);
  const hasReactions = Object.keys(props.reactions).length > 0;
  // The add button shows on hover (web), once there are reactions, or while picking; on phones,
  // pressing and holding a message opens the picker.
  const showAdd = hovered || hasReactions || props.picking;
  const reactions = !showAdd ? null : (
    <View style={{ flexDirection: "row", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
      {Object.entries(props.reactions).map(([emoji, users]) => {
        const mine = users.includes(props.userId);
        return (
          <Pressable
            key={emoji}
            onPress={() => props.onReact(emoji)}
            accessibilityRole="button"
            accessibilityLabel={`${emoji} ${users.length}${mine ? ", including you" : ""}`}
            style={{
              flexDirection: "row",
              gap: 4,
              borderWidth: 1,
              borderColor: mine ? colors.royal : colors.line,
              backgroundColor: mine ? colors.tint : "#fff",
              borderRadius: 999,
              paddingHorizontal: 9,
              paddingVertical: 3,
            }}
          >
            <Text style={{ fontSize: 13 }}>{emoji}</Text>
            <Text style={{ fontSize: 12, fontWeight: "600", color: mine ? colors.blue : colors.sub }}>
              {users.length}
            </Text>
          </Pressable>
        );
      })}
      <Pressable
        onPress={props.onPick}
        accessibilityRole="button"
        accessibilityLabel="Add a reaction"
        style={{
          borderWidth: 1,
          borderStyle: "dashed",
          borderColor: colors.line,
          borderRadius: 999,
          paddingHorizontal: 8,
          paddingVertical: 3,
        }}
      >
        <Text style={{ fontSize: 12, color: colors.faint }}>+ 🙂</Text>
      </Pressable>
      {props.picking ? (
        <View
          style={{
            flexDirection: "row",
            gap: 2,
            backgroundColor: "#fff",
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: 999,
            paddingHorizontal: 4,
          }}
        >
          {REACTIONS.map((e) => (
            <Pressable
              key={e}
              onPress={() => props.onReact(e)}
              accessibilityRole="button"
              accessibilityLabel={`React ${e}`}
              style={{ padding: 5 }}
            >
              <Text style={{ fontSize: 16 }}>{e}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
  const time = props.pending ? "Sending…" : ago(m.createdAt);

  if (m.kind !== "text") {
    const verb =
      m.kind === "completion" ? "completed" : m.kind === "skip" ? "skipped" : "posted an update on";
    const icon = m.kind === "completion" ? "check" : m.kind === "skip" ? "minus" : "edit-2";
    return (
      <Pressable
        onLongPress={props.onPick}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        style={{
          flexDirection: "row",
          gap: space.md,
          paddingHorizontal: space.lg,
          paddingVertical: 6,
          opacity: props.pending ? 0.6 : 1,
        }}
      >
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: m.kind === "completion" ? colors.blue : "#fff",
            borderWidth: m.kind === "completion" ? 0 : 1.5,
            borderColor: colors.faint,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={icon} size={14} color={m.kind === "completion" ? "#fff" : colors.sub} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
          <Text style={{ fontSize: 14, color: colors.ink, lineHeight: 28 }}>
            {props.author} {verb} <Text style={{ fontWeight: "700" }}>{props.itemTitle ?? m.body}</Text>
            <Text style={{ fontSize: 12, color: colors.faint }}> {time}</Text>
          </Text>
          {m.kind !== "completion" && m.body ? (
            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: radius.card,
                paddingHorizontal: 14,
                paddingVertical: 10,
                alignSelf: "flex-start",
                maxWidth: 560,
              }}
            >
              <Text style={{ fontSize: 15, color: colors.ink }}>{m.body}</Text>
            </View>
          ) : null}
          {reactions}
        </View>
      </Pressable>
    );
  }
  return (
    <Pressable
      onLongPress={props.onPick}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      style={{
        flexDirection: "row",
        gap: space.md,
        paddingHorizontal: space.lg,
        paddingVertical: 6,
        opacity: props.pending ? 0.6 : 1,
      }}
    >
      <Avatar id={m.authorId} name={props.authorName} size={28} />
      <View style={{ flex: 1, minWidth: 0, gap: 6, alignItems: "flex-start" }}>
        <View
          style={{
            backgroundColor: colors.tint,
            borderRadius: 14,
            borderTopLeftRadius: 4,
            paddingHorizontal: 14,
            paddingVertical: 10,
            maxWidth: 560,
          }}
        >
          <Text style={{ fontSize: 15, color: colors.noteInk, lineHeight: 21 }}>{m.body}</Text>
          <Text style={{ fontSize: 12, color: colors.sub, marginTop: 4 }}>
            {props.author} · {time}
          </Text>
        </View>
        {reactions}
      </View>
    </Pressable>
  );
}

function InviteSheet(props: {
  spaceId: string;
  spaceName: string;
  visible: boolean;
  wide: boolean;
  onClose: () => void;
}) {
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const make = async () => {
    setBusy(true);
    setError("");
    try {
      setLink((await createInvite(props.spaceId)).url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const share = async () => {
    if (Platform.OS === "web") {
      try {
        await navigator.clipboard.writeText(link);
        setCopied(true);
      } catch {
        setError("Couldn't copy. Select the link and copy it yourself.");
      }
      return;
    }
    await Share.share({ message: `Join my space "${props.spaceName}" on Buildpair: ${link}` });
  };
  return (
    <Sheet
      visible={props.visible}
      onClose={props.onClose}
      title={`Invite to ${props.spaceName}`}
      wide={props.wide}
    >
      <Text style={{ fontSize: 14, color: colors.sub, lineHeight: 20 }}>
        Anyone who opens the link joins this space as a supporter. They'll see what's in it (except things
        you've kept to yourself) and can chat here.
      </Text>
      {link ? (
        <>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: space.sm,
              backgroundColor: colors.tint,
              borderRadius: radius.control,
              padding: space.md,
            }}
          >
            <Icon name="link" size={16} color={colors.noteInk} />
            <Text
              selectable
              numberOfLines={1}
              style={{ flex: 1, fontSize: 14, fontWeight: "600", color: colors.noteInk }}
            >
              {link}
            </Text>
          </View>
          <Button
            label={Platform.OS === "web" ? (copied ? "Copied" : "Copy link") : "Share link"}
            onPress={share}
          />
        </>
      ) : (
        <Button label="Make an invite link" onPress={make} busy={busy} />
      )}
      <ErrorText>{error}</ErrorText>
    </Sheet>
  );
}
