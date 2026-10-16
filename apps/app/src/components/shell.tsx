import { router } from "expo-router";
import { type ReactNode, useMemo } from "react";
import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { authClient } from "../lib/auth";
import { resetBlocks, useBlocked } from "../lib/blocks";
import { resetSpaces, useSpaces, useSpaceViews } from "../lib/spaces";
import { colors, space, WIDE } from "../lib/theme";
import { useUnread } from "../lib/unread";
import { stopAllSyncs } from "../lib/use-space";
import type { HoverState } from "./kit";
import { Avatar, Icon, type IconName, SpaceTile, UnreadDot, Wordmark } from "./kit";

export type Section = "today" | "spaces" | "supporting" | "activity" | "profile" | { spaceId: string };
type Href = "/" | "/spaces" | "/supporting" | "/activity";

export const TAB_BAR_HEIGHT = 58;

export function useWide() {
  return useWindowDimensions().width >= WIDE;
}

export async function signOut() {
  stopAllSyncs();
  resetSpaces();
  resetBlocks();
  await authClient.signOut();
}

/**
 * The frame around every signed-in screen. Wide screens get the sidebar (navigation, then your
 * spaces); phones get the bottom tab bar on Today, Spaces and Supporting, and nothing extra inside a space.
 */
export function Shell({
  active,
  children,
  tabs = true,
}: {
  active: Section;
  children: ReactNode;
  tabs?: boolean;
}) {
  const wide = useWide();
  if (wide) {
    return (
      <SafeAreaView
        style={{ flex: 1, flexDirection: "row", backgroundColor: colors.bg }}
        edges={["top", "bottom"]}
      >
        <Sidebar active={active} />
        <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top"]}>
      <View style={{ flex: 1 }}>{children}</View>
      {tabs ? <TabBar active={active} /> : <BottomInset />}
    </SafeAreaView>
  );
}

function BottomInset() {
  const insets = useSafeAreaInsets();
  return <View style={{ height: insets.bottom }} />;
}

const TABS: { key: "today" | "spaces" | "supporting"; label: string; icon: IconName; href: Href }[] = [
  { key: "today", label: "Today", icon: "check", href: "/" },
  { key: "spaces", label: "Spaces", icon: "grid", href: "/spaces" },
  { key: "supporting", label: "Supporting", icon: "users", href: "/supporting" },
];

function TabBar({ active }: { active: Section }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: "row",
        borderTopWidth: 1,
        borderColor: colors.line,
        backgroundColor: "#fff",
        paddingBottom: insets.bottom,
      }}
    >
      {TABS.map((t) => {
        const on = active === t.key;
        return (
          <Pressable
            key={t.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => router.replace(t.href)}
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              height: TAB_BAR_HEIGHT,
              gap: 3,
            }}
          >
            <Icon name={t.icon} size={20} color={on ? colors.blue : colors.faint} />
            <Text
              style={{ fontSize: 11, fontWeight: on ? "600" : "500", color: on ? colors.blue : colors.faint }}
            >
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Sidebar({ active }: { active: Section }) {
  const { spaces } = useSpaces();
  const { data: session } = authClient.useSession();
  const ids = useMemo(() => (spaces ?? []).map((s) => s.id), [spaces]);
  const views = useSpaceViews(ids, session?.user.id ?? "");
  const unread = useUnread(ids, views, session?.user.id ?? "", useBlocked());
  const activeSpace = typeof active === "object" ? active.spaceId : null;
  const name = session?.user.name || session?.user.email || "";
  return (
    <View
      style={{ width: 248, backgroundColor: colors.sidebar, borderRightWidth: 1, borderColor: colors.line }}
    >
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: 2 }}>
        <View style={{ paddingHorizontal: 6, paddingTop: 4, paddingBottom: space.lg }}>
          <Wordmark size={19} />
        </View>
        <NavRow icon="check" label="Today" href="/" on={active === "today"} />
        <NavRow icon="grid" label="Spaces" href="/spaces" on={active === "spaces"} />
        <NavRow icon="users" label="Supporting" href="/supporting" on={active === "supporting"} />
        <NavRow icon="bell" label="Activity" href="/activity" on={active === "activity"} />
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 8,
            marginTop: space.xl,
            marginBottom: space.xs,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: "600", color: colors.faint }}>Your spaces</Text>
          <Pressable
            onPress={() => router.push({ pathname: "/spaces", params: { new: "1" } })}
            accessibilityRole="button"
            accessibilityLabel="New space"
            hitSlop={10}
          >
            <Icon name="plus" size={15} color={colors.faint} />
          </Pressable>
        </View>
        {(spaces ?? []).map((s) => (
          <Pressable
            key={s.id}
            accessibilityRole="link"
            onPress={() => router.push({ pathname: "/spaces/[id]", params: { id: s.id } })}
            style={({ hovered }: HoverState) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingVertical: 7,
              paddingHorizontal: 8,
              borderRadius: 8,
              backgroundColor: activeSpace === s.id ? "#fff" : hovered ? "#EEF0F5" : "transparent",
              borderWidth: 1,
              borderColor: activeSpace === s.id ? colors.line : "transparent",
            })}
          >
            <SpaceTile id={s.id} name={s.name} size={20} />
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: colors.ink }}>
              {s.name}
            </Text>
            {unread.has(s.id) && activeSpace !== s.id ? <UnreadDot /> : null}
            {s.role === "supporter" ? <Icon name="users" size={13} color={colors.faint} /> : null}
          </Pressable>
        ))}
      </ScrollView>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          padding: space.lg,
          borderTopWidth: 1,
          borderColor: colors.line,
        }}
      >
        <Pressable
          onPress={() => router.push("/profile")}
          accessibilityRole="link"
          accessibilityLabel="Your profile"
          style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10 }}
        >
          <Avatar id={session?.user.id ?? "me"} name={name} size={28} />
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              fontSize: 14,
              fontWeight: active === "profile" ? "700" : "600",
              color: active === "profile" ? colors.blue : colors.ink,
            }}
          >
            {session?.user.name || "You"}
          </Text>
        </Pressable>
        <Pressable onPress={signOut} accessibilityRole="button" hitSlop={8}>
          <Text style={{ fontSize: 13, color: colors.sub }}>Sign out</Text>
        </Pressable>
      </View>
    </View>
  );
}

function NavRow({ icon, label, href, on }: { icon: IconName; label: string; href: Href; on: boolean }) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.replace(href)}
      style={({ hovered }: HoverState) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 8,
        paddingHorizontal: 8,
        borderRadius: 8,
        backgroundColor: on ? "#fff" : hovered ? "#EEF0F5" : "transparent",
        borderWidth: 1,
        borderColor: on ? colors.line : "transparent",
      })}
    >
      <Icon name={icon} size={16} color={on ? colors.ink : colors.sub} />
      <Text style={{ fontSize: 14, fontWeight: on ? "600" : "500", color: on ? colors.ink : colors.sub }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A screen's big title row, with optional actions on the right. */
export function PageHeader({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.md, paddingBottom: space.md }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 28, fontWeight: "800", letterSpacing: -0.6, color: colors.ink }}>
          {title}
        </Text>
        {sub ? <Text style={{ fontSize: 13, color: colors.sub, marginTop: 2 }}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
}
