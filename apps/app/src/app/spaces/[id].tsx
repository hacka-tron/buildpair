import { newId, parseQuickAdd, type SpaceState, weekProgress } from "@buildpair/domain";
import type { Item, Message } from "@buildpair/protocol";
import type { Change } from "@buildpair/sync";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { SpaceSettings } from "../../components/space-settings";
import { Button, ErrorText } from "../../components/ui";
import {
  answerRequest,
  createInvite,
  type JoinRequest,
  listRequests,
  type ReportReason,
  removeMember,
  resetInvites,
  sendReport,
} from "../../lib/api";
import { authClient } from "../../lib/auth";
import { block, unblock, useBlocked } from "../../lib/blocks";
import { ago, localToday, peopleLine } from "../../lib/format";
import { applyChange, markSpaceGone, patchSpace, refreshSpaces, useSpaces } from "../../lib/spaces";
import { nudgeFor } from "../../lib/supporting";
import { colors, radius, space } from "../../lib/theme";
import { markRead, useReadPositions } from "../../lib/unread";
import { useSpace } from "../../lib/use-space";

const REACTIONS = ["🔥", "👏", "❤️", "🙌", "😂"];

export default function SpaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const wide = useWide();
  const today = localToday();
  const { data: session } = authClient.useSession();
  const userId = session?.user.id ?? "";
  const { sync, view, pendingIds, connected, online, error } = useSpace(id, userId);
  const { spaces, gone } = useSpaces();
  const summary = spaces?.find((s) => s.id === id);
  const name = view.name || summary?.name || "";
  const purpose = view.purpose || summary?.purpose || "";
  const [inviting, setInviting] = useState(false);
  const [settings, setSettings] = useState(false);
  const isOwner = view.members[userId]?.role === "owner";
  const waiting = isOwner ? (summary?.requests ?? 0) : 0;
  // The room is the source of truth; bring the list (sidebar, Spaces tab) in line when it differs.
  useEffect(() => {
    // Only once connected: a copy saved on the device can be older than the list.
    if (!summary || !view.name || !connected) return;
    const color = view.color ?? null;
    if (view.name !== summary.name || view.purpose !== summary.purpose || color !== (summary.color ?? null))
      patchSpace(id, { name: view.name, purpose: view.purpose, color });
  }, [id, summary, connected, view.name, view.purpose, view.color]);
  const [opened, setOpened] = useState<Item | null>(null);
  const blocked = useBlocked();
  // Everything in the chat counts as seen while the space is open.
  useReadPositions(userId);
  const lastSeq = view.messages.at(-1)?.seq ?? 0;
  useEffect(() => {
    if (view.seq > 0) markRead(id, lastSeq);
  }, [id, lastSeq, view.seq]);
  /** The person whose sheet is open (report, block, remove), and the message being reported if any. */
  const [person, setPerson] = useState<{ userId: string; messageId?: string } | null>(null);
  const [peopleOpen, setPeopleOpen] = useState(false);

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
      blocked={blocked}
      onReport={(m) => setPerson({ userId: m.authorId, messageId: m.id })}
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
      isOwner={isOwner}
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
        spaceId={id}
        view={view}
        userId={userId}
        today={today}
        wide={wide}
        onClose={() => setOpened(null)}
        apply={(change) => applyChange(id, userId, change)}
      />
      {inviteSheet}
      {person ? (
        <PersonSheet
          key={`${person.userId}-${person.messageId ?? ""}`}
          spaceId={id}
          userId={person.userId}
          messageId={person.messageId}
          name={view.members[person.userId]?.name ?? "Someone"}
          member={Boolean(view.members[person.userId])}
          isOwner={isOwner}
          blocked={blocked.has(person.userId)}
          wide={wide}
          onClose={() => setPerson(null)}
        />
      ) : null}
      {peopleOpen && !wide ? (
        <Sheet visible onClose={() => setPeopleOpen(false)} title="People" wide={false}>
          <People
            members={members}
            online={online}
            userId={userId}
            spaceId={id}
            onInvite={() => {
              setPeopleOpen(false);
              setInviting(true);
            }}
            onPerson={(uid) => {
              setPeopleOpen(false);
              setPerson({ userId: uid });
            }}
          />
        </Sheet>
      ) : null}
      {settings ? (
        <SpaceSettings
          spaceId={id}
          name={name}
          purpose={purpose}
          color={view.color ?? summary?.color ?? null}
          wide={wide}
          onClose={() => setSettings(false)}
          apply={(change) => applyChange(id, userId, change)}
          onSaved={(patch) => patchSpace(id, patch)}
        />
      ) : null}
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

  if (gone.includes(id)) {
    return (
      <Shell active={{ spaceId: id }} tabs={false}>
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: space.xl,
            gap: space.md,
          }}
        >
          <Text style={{ fontSize: 17, fontWeight: "700", color: colors.ink }}>This space is gone</Text>
          <Text style={{ fontSize: 14, color: colors.sub, textAlign: "center", maxWidth: 360 }}>
            Its owner deleted it, or you're no longer in it.
          </Text>
          <Button label="Back to your spaces" kind="secondary" onPress={() => router.replace("/spaces")} />
        </View>
      </Shell>
    );
  }

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
          <SpaceTile id={id} name={name || "?"} size={40} color={view.color ?? summary?.color} />
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
          {isOwner ? (
            <Pressable
              onPress={() => setSettings(true)}
              accessibilityRole="button"
              accessibilityLabel="Space settings"
              hitSlop={8}
              style={{ padding: space.sm }}
            >
              <Icon name="settings" size={18} color={colors.sub} />
            </Pressable>
          ) : null}
          <Button
            label={waiting ? `Invite · ${waiting} waiting` : "Invite"}
            kind="secondary"
            onPress={() => setInviting(true)}
          />
        </View>
        {errorBar}
        <View style={{ flex: 1, flexDirection: "row" }}>
          <View style={{ flex: 1, minWidth: 0 }}>{chat}</View>
          <ScrollView
            style={{ width: 330, flexGrow: 0, borderLeftWidth: 1, borderColor: colors.line }}
            contentContainerStyle={{ padding: space.xl, gap: space.xl }}
          >
            {itemsPanel}
            <People
              members={members}
              online={online}
              userId={userId}
              spaceId={id}
              onInvite={() => setInviting(true)}
              onPerson={(uid) => setPerson({ userId: uid })}
            />
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
            {isOwner ? (
              <Pressable
                onPress={() => setSettings(true)}
                accessibilityRole="button"
                accessibilityLabel="Space settings"
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
                <Icon name="settings" size={16} color={colors.ink} />
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => setInviting(true)}
              accessibilityRole="button"
              accessibilityLabel={waiting ? `Invite people, ${waiting} waiting to join` : "Invite people"}
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
              {waiting ? (
                <View
                  style={{
                    position: "absolute",
                    top: -4,
                    right: -4,
                    minWidth: 16,
                    height: 16,
                    borderRadius: 8,
                    paddingHorizontal: 4,
                    backgroundColor: colors.blue,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>{waiting}</Text>
                </View>
              ) : null}
            </Pressable>
          </View>
          <Pressable
            onPress={() => setPeopleOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="People"
          >
            <Text numberOfLines={1} style={{ fontSize: 13, color: colors.sub }}>
              {peopleLine(["You", ...others.map((m) => m.name)])}
              {status ? ` · ${status}` : ""}
            </Text>
          </Pressable>
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
  spaceId: string;
  onInvite: () => void;
  onPerson: (userId: string) => void;
}) {
  const me = props.members.find((m) => m.userId === props.userId);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState("");
  const leave = async () => {
    setError("");
    try {
      await removeMember(props.spaceId, props.userId);
      markSpaceGone(props.spaceId);
      void refreshSpaces();
      router.replace("/");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <View style={{ gap: space.sm }}>
      <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ink }}>People</Text>
      {props.members.map((m) => {
        const here = props.online.includes(m.userId);
        const self = m.userId === props.userId;
        return (
          <Pressable
            key={m.userId}
            disabled={self}
            onPress={() => props.onPerson(m.userId)}
            accessibilityRole={self ? undefined : "button"}
            accessibilityLabel={self ? undefined : `${m.name}: report, block or remove`}
            style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 }}
          >
            <Avatar id={m.userId} name={m.name} size={28} online={here} />
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: colors.ink }}>
              {self ? `${m.name} (you)` : m.name}
            </Text>
            <Text style={{ fontSize: 12, color: here ? colors.online : colors.faint }}>
              {here ? "Here now" : m.role === "owner" ? "Owner" : "Supporter"}
            </Text>
          </Pressable>
        );
      })}
      <Pressable onPress={props.onInvite} accessibilityRole="button" style={{ paddingVertical: 6 }}>
        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.blue }}>+ Invite people</Text>
      </Pressable>
      {me?.role === "supporter" ? (
        leaving ? (
          <View style={{ gap: space.sm }}>
            <Text style={{ fontSize: 13, color: colors.sub }}>
              Leave this space? You'll stop seeing it. Your messages stay in its chat.
            </Text>
            <View style={{ flexDirection: "row", gap: space.sm }}>
              <View style={{ flex: 1 }}>
                <Button label="Stay" kind="secondary" onPress={() => setLeaving(false)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Leave" onPress={leave} />
              </View>
            </View>
            <ErrorText>{error}</ErrorText>
          </View>
        ) : (
          <Pressable
            onPress={() => setLeaving(true)}
            accessibilityRole="button"
            style={{ paddingVertical: 6 }}
          >
            <Text style={{ fontSize: 13, color: colors.sub }}>Leave this space</Text>
          </Pressable>
        )
      ) : null}
    </View>
  );
}

const REASONS: { value: ReportReason; label: string }[] = [
  { value: "harassment", label: "Harassment or bullying" },
  { value: "inappropriate", label: "Inappropriate or offensive" },
  { value: "spam", label: "Spam" },
  { value: "other", label: "Something else" },
];

/** Someone in the space: report them (or one of their messages), block them, or as the owner remove them. */
function PersonSheet(props: {
  spaceId: string;
  userId: string;
  messageId?: string;
  name: string;
  member: boolean;
  isOwner: boolean;
  blocked: boolean;
  wide: boolean;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<null | "report">(props.messageId ? "report" : null);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const act = async (work: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setError("");
    try {
      await work();
      setDone(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const title =
    mode === "report" ? (props.messageId ? "Report this message" : `Report ${props.name}`) : props.name;
  return (
    <Sheet visible onClose={props.onClose} title={title} wide={props.wide}>
      {done ? (
        <>
          <Text style={{ fontSize: 14, color: colors.ink, lineHeight: 20 }}>{done}</Text>
          <Button label="Done" onPress={props.onClose} />
        </>
      ) : mode === "report" ? (
        <>
          <Text style={{ fontSize: 14, color: colors.sub }}>
            What's wrong? We look at every report within a day.
          </Text>
          {REASONS.map((r) => (
            <Button
              key={r.value}
              label={r.label}
              kind={reason === r.value ? "primary" : "secondary"}
              onPress={() => setReason(r.value)}
            />
          ))}
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Anything else we should know (optional)"
            placeholderTextColor={colors.faint}
            multiline
            maxLength={1000}
            style={{
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: radius.control,
              paddingHorizontal: space.md,
              paddingVertical: 12,
              fontSize: 16,
              minHeight: 70,
              textAlignVertical: "top",
              color: colors.ink,
              outlineColor: colors.royal,
            }}
          />
          <ErrorText>{error}</ErrorText>
          <Button
            label="Send report"
            busy={busy}
            disabled={!reason}
            onPress={() =>
              act(
                () =>
                  sendReport({
                    spaceId: props.spaceId,
                    userId: props.userId,
                    messageId: props.messageId,
                    reason: reason!,
                    note: note.trim() || undefined,
                  }),
                props.blocked
                  ? "Thanks for telling us. We'll look at it within a day."
                  : `Thanks for telling us. We'll look at it within a day. You can also block ${props.name} so you don't see their messages.`,
              )
            }
          />
        </>
      ) : (
        <>
          <Button label={`Report ${props.name}`} kind="secondary" onPress={() => setMode("report")} />
          <Button
            label={props.blocked ? `Unblock ${props.name}` : `Block ${props.name}`}
            kind="secondary"
            busy={busy}
            onPress={() =>
              act(
                () => (props.blocked ? unblock(props.userId) : block(props.userId)),
                props.blocked
                  ? `${props.name} is unblocked. You'll see their messages again.`
                  : `${props.name} is blocked. You won't see their messages or reactions, and they can't ask to join your spaces.`,
              )
            }
          />
          {props.isOwner && props.member ? (
            <Button
              label={`Remove ${props.name} from this space`}
              kind="secondary"
              busy={busy}
              onPress={() =>
                act(
                  () => removeMember(props.spaceId, props.userId),
                  `${props.name} is out of this space. Their messages stay in the chat.`,
                )
              }
            />
          ) : null}
          <ErrorText>{error}</ErrorText>
        </>
      )}
    </Sheet>
  );
}

type Row = { kind: "message"; message: Message } | { kind: "day"; label: string; key: string };

/** Reactions with blocked people taken out (and emoji nobody else used dropped). */
function withoutBlocked(byEmoji: Record<string, string[]>, blocked: ReadonlySet<string>) {
  if (blocked.size === 0) return byEmoji;
  return Object.fromEntries(
    Object.entries(byEmoji)
      .map(([emoji, users]) => [emoji, users.filter((u) => !blocked.has(u))] as const)
      .filter(([, users]) => users.length > 0),
  );
}

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
  /** People this person blocked: their messages and reactions don't show. */
  blocked: ReadonlySet<string>;
  onReport: (message: Message) => void;
  onReact: (messageId: string, emoji: string) => void;
  /** Returns false when the message didn't go through, so the draft stays. */
  onSend: (body: string) => boolean;
  onTyping: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [picker, setPicker] = useState<string | null>(null);
  const nudge = useMemo(() => nudgeFor(props.view, props.userId), [props.view, props.userId]);
  const [nudgeHidden, setNudgeHidden] = useState(false);
  const lastTyping = useRef(0);
  const rows = useMemo(() => {
    const out: Row[] = [];
    let lastDay = "";
    for (const m of props.view.messages) {
      if (props.blocked.has(m.authorId)) continue;
      const day = localToday(new Date(m.createdAt));
      if (day !== lastDay) {
        out.push({ kind: "day", label: dayLabel(m.createdAt), key: `day-${day}` });
        lastDay = day;
      }
      out.push({ kind: "message", message: m });
    }
    return out.reverse();
  }, [props.view.messages, props.blocked]);
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
              reactions={withoutBlocked(props.view.reactions[r.message.id] ?? {}, props.blocked)}
              userId={props.userId}
              picking={picker === r.message.id}
              onPick={() => setPicker((p) => (p === r.message.id ? null : r.message.id))}
              onReact={(emoji) => {
                setPicker(null);
                props.onReact(r.message.id, emoji);
              }}
              onReport={
                r.message.authorId === props.userId
                  ? undefined
                  : () => {
                      setPicker(null);
                      props.onReport(r.message);
                    }
              }
            />
          )
        }
      />
      {nudge && !nudgeHidden && !draft ? (
        <View style={{ gap: space.sm, paddingHorizontal: space.md, paddingTop: space.md }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={{ flex: 1, fontSize: 13, color: colors.sub }}>
              {nudge.ownerName} has been quiet for {nudge.quietDays} days. Send a nudge?
            </Text>
            <Pressable
              onPress={() => setNudgeHidden(true)}
              accessibilityRole="button"
              accessibilityLabel="Hide suggestions"
              hitSlop={8}
            >
              <Icon name="x" size={14} color={colors.faint} />
            </Pressable>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: space.sm }}
          >
            {nudge.suggestions.map((text) => (
              <Pressable
                key={text}
                onPress={() => setDraft(text)}
                accessibilityRole="button"
                accessibilityLabel={`Start a message: ${text}`}
                style={{
                  borderWidth: 1,
                  borderColor: colors.line,
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  maxWidth: 320,
                  backgroundColor: "#fff",
                }}
              >
                <Text numberOfLines={1} style={{ fontSize: 13, color: colors.ink }}>
                  {text}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
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
  /** Missing for your own messages. */
  onReport?: () => void;
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
      {props.picking && props.onReport ? (
        <Pressable
          onPress={props.onReport}
          accessibilityRole="button"
          hitSlop={8}
          style={{ paddingHorizontal: 6 }}
        >
          <Text style={{ fontSize: 12, fontWeight: "600", color: colors.sub }}>Report</Text>
        </Pressable>
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
  isOwner: boolean;
  visible: boolean;
  wide: boolean;
  onClose: () => void;
}) {
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [answering, setAnswering] = useState("");
  const { spaceId, isOwner, visible } = props;
  useEffect(() => {
    if (!visible || !isOwner) return;
    listRequests(spaceId)
      .then((r) => setRequests(r.requests))
      .catch((e: Error) => setError(e.message));
  }, [spaceId, isOwner, visible]);
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
  const answer = async (who: string, choice: "approve" | "decline") => {
    setAnswering(who);
    setError("");
    try {
      await answerRequest(props.spaceId, who, choice);
      setRequests((r) => r.filter((x) => x.userId !== who));
      void refreshSpaces();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAnswering("");
    }
  };
  const reset = async () => {
    setError("");
    try {
      await resetInvites(props.spaceId);
      setLink("");
      setCopied(false);
    } catch (e) {
      setError((e as Error).message);
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
        {props.isOwner
          ? "People who open the link ask to join. You approve each one. Once in, they see what's here (except things you've kept to yourself) and can chat."
          : "People who open the link ask to join. The owner approves each one."}
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
      {props.isOwner && requests.length ? (
        <View style={{ gap: space.sm }}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ink }}>Asking to join</Text>
          {requests.map((r) => (
            <View key={r.userId} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              <Avatar id={r.userId} name={r.name} size={28} />
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: colors.ink }}>
                {r.name}
              </Text>
              <Button
                label="Decline"
                kind="secondary"
                disabled={answering === r.userId}
                onPress={() => answer(r.userId, "decline")}
              />
              <Button
                label="Let in"
                disabled={answering === r.userId}
                onPress={() => answer(r.userId, "approve")}
              />
            </View>
          ))}
        </View>
      ) : null}
      {props.isOwner ? (
        <Pressable onPress={reset} accessibilityRole="button" hitSlop={8} style={{ alignSelf: "center" }}>
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.blue }}>Stop all old links</Text>
        </Pressable>
      ) : null}
      <ErrorText>{error}</ErrorText>
    </Sheet>
  );
}
