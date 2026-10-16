import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";
import { authClient } from "../lib/auth";
import { useSpaces, useSpaceViews } from "../lib/spaces";
import { colors, space } from "../lib/theme";
import { Icon, type IconName, SpaceTile } from "./kit";

interface Command {
  key: string;
  label: string;
  group: "Go to" | "Do" | "Spaces" | "Items";
  icon?: IconName;
  spaceId?: string;
  spaceName?: string;
  run: () => void;
}

const go = (path: Parameters<typeof router.push>[0]) => () => router.push(path);

/** ⌘K / Ctrl K: jump anywhere and run the common actions, from the keyboard. Wide screens on the web. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const input = useRef<TextInput>(null);
  const { data: session } = authClient.useSession();
  const userId = session?.user.id ?? "";
  const { spaces } = useSpaces();
  const ids = useMemo(() => (spaces ?? []).map((s) => s.id), [spaces]);
  const views = useSpaceViews(open ? ids : [], userId);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        setQuery("");
        setCursor(0);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const commands = useMemo<Command[]>(() => {
    const out: Command[] = [
      { key: "today", label: "Today", group: "Go to", icon: "check", run: go("/") },
      { key: "upcoming", label: "Upcoming", group: "Go to", icon: "calendar", run: go("/upcoming") },
      { key: "spaces", label: "Spaces", group: "Go to", icon: "grid", run: go("/spaces") },
      { key: "supporting", label: "Supporting", group: "Go to", icon: "users", run: go("/supporting") },
      { key: "discover", label: "Discover", group: "Go to", icon: "compass", run: go("/discover") },
      { key: "activity", label: "Activity", group: "Go to", icon: "bell", run: go("/activity") },
      { key: "profile", label: "Profile", group: "Go to", icon: "user", run: go("/profile") },
      {
        key: "add",
        label: "Add something to Today",
        group: "Do",
        icon: "plus",
        run: go({ pathname: "/", params: { add: "1" } }),
      },
      {
        key: "new",
        label: "New space",
        group: "Do",
        icon: "folder-plus",
        run: go({ pathname: "/spaces", params: { new: "1" } }),
      },
      { key: "review", label: "Weekly review", group: "Do", icon: "edit-3", run: go("/review") },
    ];
    for (const s of spaces ?? [])
      out.push({
        key: `s-${s.id}`,
        label: s.name,
        group: "Spaces",
        spaceId: s.id,
        spaceName: s.name,
        run: go({ pathname: "/spaces/[id]", params: { id: s.id } }),
      });
    for (const s of spaces ?? []) {
      const view = views[s.id];
      for (const item of Object.values(view?.items ?? {})) {
        if (item.status !== "open" || item.parentId) continue;
        out.push({
          key: `i-${item.id}`,
          label: item.title,
          group: "Items",
          spaceId: s.id,
          spaceName: view?.name || s.name,
          run: go({ pathname: "/spaces/[id]", params: { id: s.id, item: item.id } }),
        });
      }
    }
    return out;
  }, [spaces, views]);

  const q = query.trim().toLowerCase();
  const shown = (
    q
      ? commands.filter((c) => c.label.toLowerCase().includes(q))
      : commands.filter((c) => c.group !== "Items")
  ).slice(0, 12);
  const pick = (c: Command | undefined) => {
    if (!c) return;
    setOpen(false);
    c.run();
  };

  if (!open) return null;
  return (
    <Modal transparent visible animationType="none" onRequestClose={() => setOpen(false)}>
      <Pressable
        onPress={() => setOpen(false)}
        accessibilityLabel="Close"
        style={{ flex: 1, backgroundColor: "rgba(15,20,40,0.25)", alignItems: "center", paddingTop: 92 }}
      >
        <Pressable
          onPress={() => undefined}
          style={{
            width: 560,
            maxWidth: "92%",
            backgroundColor: colors.card,
            borderRadius: 14,
            overflow: "hidden",
            boxShadow: "0 30px 70px -20px rgba(15,20,40,0.55)",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderColor: colors.line,
            }}
          >
            <Icon name="search" size={18} color={colors.sub} />
            <TextInput
              ref={input}
              autoFocus
              value={query}
              onChangeText={(t) => {
                setQuery(t);
                setCursor(0);
              }}
              placeholder="Search spaces, items and actions"
              placeholderTextColor={colors.faint}
              accessibilityLabel="Search spaces, items and actions"
              onKeyPress={(e) => {
                const k = e.nativeEvent.key;
                if (k === "ArrowDown") setCursor((c) => Math.min(c + 1, shown.length - 1));
                else if (k === "ArrowUp") setCursor((c) => Math.max(c - 1, 0));
                else if (k === "Escape") setOpen(false);
              }}
              onSubmitEditing={() => pick(shown[cursor])}
              style={{ flex: 1, fontSize: 16, color: colors.ink, outlineStyle: "none" } as object}
            />
          </View>
          <View style={{ padding: 6 }}>
            {shown.length === 0 ? (
              <Text style={{ fontSize: 13, color: colors.faint, padding: space.md }}>Nothing matches.</Text>
            ) : null}
            {shown.map((c, i) => (
              <View key={c.key}>
                {i === 0 || shown[i - 1]!.group !== c.group ? (
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "600",
                      color: colors.faint,
                      paddingHorizontal: 10,
                      paddingTop: 8,
                      paddingBottom: 4,
                    }}
                  >
                    {c.group}
                  </Text>
                ) : null}
                <Pressable
                  onPress={() => pick(c)}
                  onHoverIn={() => setCursor(i)}
                  accessibilityRole="button"
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    borderRadius: 8,
                    backgroundColor: i === cursor ? colors.tint : "transparent",
                  }}
                >
                  {c.icon ? (
                    <Icon name={c.icon} size={16} color={colors.sub} />
                  ) : (
                    <SpaceTile id={c.spaceId!} name={c.spaceName ?? c.label} size={16} />
                  )}
                  <Text
                    numberOfLines={1}
                    style={{ flex: 1, fontSize: 13, color: i === cursor ? colors.noteInk : colors.ink }}
                  >
                    {c.label}
                  </Text>
                  {c.group === "Items" ? (
                    <Text style={{ fontSize: 12, color: colors.faint }}>{c.spaceName}</Text>
                  ) : null}
                </Pressable>
              </View>
            ))}
          </View>
          <View
            style={{
              flexDirection: "row",
              gap: 16,
              paddingHorizontal: 16,
              paddingVertical: 9,
              borderTopWidth: 1,
              borderColor: colors.line,
              backgroundColor: colors.surface,
            }}
          >
            <Text style={{ fontSize: 11, color: colors.sub }}>↑↓ to move</Text>
            <Text style={{ fontSize: 11, color: colors.sub }}>↵ to open</Text>
            <Text style={{ fontSize: 11, color: colors.sub }}>Esc to close</Text>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
