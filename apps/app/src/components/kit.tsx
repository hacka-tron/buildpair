import type { Item, SpaceColor } from "@buildpair/protocol";
import Feather from "@expo/vector-icons/Feather";
import { type ReactNode, useRef } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { dueLabel } from "../lib/format";
import { useSpaceSummary } from "../lib/spaces";
import { colors, personColor, radius, space, spaceColor } from "../lib/theme";

/** react-native-web adds `hovered` to Pressable's style callback; the native types leave it out. */
export type HoverState = { pressed: boolean; hovered?: boolean };

export type IconName = React.ComponentProps<typeof Feather>["name"];

export function Icon({
  name,
  size = 18,
  color = colors.sub,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return <Feather name={name} size={size} color={color} />;
}

/** The Buildpair mark: two rounded shapes side by side, you and the person in your corner. */
export function Mark({ size = 28, light = false }: { size?: number; light?: boolean }) {
  const w = size * 0.5;
  const h = size * 0.58;
  const r = size * 0.15;
  return (
    <View style={{ width: size, height: size, justifyContent: "center" }}>
      <View
        style={{
          position: "absolute",
          left: size * 0.08,
          width: w,
          height: h,
          borderRadius: r,
          backgroundColor: light ? "#fff" : colors.royal,
        }}
      />
      <View
        style={{
          position: "absolute",
          left: size * 0.42,
          width: w,
          height: h,
          borderRadius: r,
          borderWidth: size * 0.1,
          borderColor: light ? "#fff" : colors.ink,
        }}
      />
    </View>
  );
}

export function Wordmark({ size = 20 }: { size?: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: size * 0.35 }}>
      <Mark size={size * 1.25} />
      <Text style={{ fontSize: size, fontWeight: "800", letterSpacing: -0.6, color: colors.ink }}>
        Buildpair
      </Text>
    </View>
  );
}

export function Avatar({
  id,
  name,
  size = 28,
  online,
}: {
  id: string;
  name: string;
  size?: number;
  online?: boolean;
}) {
  return (
    <View>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: personColor(id),
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "700", fontSize: size * 0.42 }}>
          {(name.trim()[0] ?? "?").toUpperCase()}
        </Text>
      </View>
      {online ? (
        <View
          style={{
            position: "absolute",
            right: -1,
            bottom: -1,
            width: size * 0.34,
            height: size * 0.34,
            borderRadius: size,
            backgroundColor: colors.online,
            borderWidth: 2,
            borderColor: colors.bg,
          }}
        />
      ) : null}
    </View>
  );
}

/** Overlapping faces of the people in a space. */
export function Faces({
  people,
  size = 22,
  max = 4,
}: {
  people: { id: string; name: string }[];
  size?: number;
  max?: number;
}) {
  return (
    <View style={{ flexDirection: "row" }}>
      {people.slice(0, max).map((p, i) => (
        <View
          key={p.id}
          style={{
            marginLeft: i === 0 ? 0 : -size * 0.28,
            borderRadius: size,
            borderWidth: 2,
            borderColor: colors.bg,
          }}
        >
          <Avatar id={p.id} name={p.name} size={size} />
        </View>
      ))}
    </View>
  );
}

export function SpaceTile({
  id,
  name,
  size = 40,
  color,
}: {
  id: string;
  name: string;
  size?: number;
  /** The picked color, when the caller has the live space; otherwise it comes from the spaces list. */
  color?: SpaceColor | null;
}) {
  const summary = useSpaceSummary(id);
  const picked = color !== undefined ? color : summary?.color;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.26,
        backgroundColor: spaceColor(id, picked),
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: "#fff", fontWeight: "700", fontSize: size * 0.42 }}>
        {(name.trim()[0] ?? "?").toUpperCase()}
      </Text>
    </View>
  );
}

/** A collapsible section header with an arrow, like "In this space" or a space's group on Today. */
export function SectionHeader({
  open,
  onToggle,
  children,
  right,
}: {
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm }}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flex: 1, minWidth: 0 }}
      >
        <Icon name={open ? "chevron-down" : "chevron-right"} size={14} color={colors.faint} />
        {children}
      </Pressable>
      {right}
    </View>
  );
}

/**
 * The tick circle. Tapping a ticked one takes the tick back, so a mis-tap is one tap to fix. A faint check
 * shows on hover (web), and a tick gives a small pop. "Won't do" shows a dash instead of a check.
 */
function Circle(props: {
  done: boolean;
  wont: boolean;
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const press = () => {
    if (!props.done)
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.25, duration: 90, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }),
      ]).start();
    props.onPress();
  };
  return (
    <Pressable
      onPress={press}
      disabled={props.disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: props.done, disabled: props.disabled }}
      accessibilityLabel={props.label}
      hitSlop={11}
    >
      {({ hovered }: HoverState) => (
        <Animated.View
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            borderWidth: props.done ? 0 : 1.6,
            borderColor: hovered && !props.disabled ? colors.blue : colors.control,
            backgroundColor: props.done ? (props.wont ? colors.control : colors.blue) : "transparent",
            alignItems: "center",
            justifyContent: "center",
            opacity: props.disabled && !props.done ? 0.5 : 1,
            transform: [{ scale }],
          }}
        >
          {props.done ? (
            <Icon name={props.wont ? "minus" : "check"} size={14} color="#fff" />
          ) : hovered && !props.disabled ? (
            <Icon name="check" size={12} color={colors.blue} />
          ) : null}
        </Animated.View>
      )}
    </Pressable>
  );
}

/** One to-do, habit or goal: the circle ticks it (or takes the tick back), the rest shows what and when. */
export function ItemRow({
  item,
  onToggle,
  meta,
  today,
  last,
  onOpen,
  readOnly,
  selection,
  quietToday,
}: {
  item: Item;
  onToggle: () => void;
  meta?: string;
  today: string;
  last?: boolean;
  /** Opens the item's details and actions. */
  onOpen?: () => void;
  /** Show the item without letting it be ticked (someone else's, or under a closed goal). */
  readOnly?: boolean;
  /** Leave out "Today" as the due day (the list is Today). */
  quietToday?: boolean;
  /**
   * Selecting several items: press and hold starts it (`onSelect`); while `active`, a tap selects
   * instead of opening. Leave out `onSelect` for items that can't be selected.
   */
  selection?: { active: boolean; selected: boolean; onSelect?: () => void };
}) {
  // A habit counts as done for the day once it's checked off today.
  const done = item.status === "done" || (item.kind === "habit" && item.doneOn.includes(today));
  const closed = item.status !== "open";
  // On a list that's already "today", a bare "Today" says nothing (a time still shows).
  const due =
    item.dueOn && !(quietToday && item.dueOn === today && !item.dueTime)
      ? dueLabel(item.dueOn, today, item.dueTime)
      : null;
  const selecting = selection?.active ?? false;
  const picked = selection?.selected ?? false;
  const canPick = Boolean(selection?.onSelect);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space.md,
        paddingVertical: 11,
        paddingHorizontal: selecting ? space.sm : 0,
        marginHorizontal: selecting ? -space.sm : 0,
        borderRadius: selecting ? radius.chip : 0,
        backgroundColor: picked ? colors.tint : "transparent",
        borderBottomWidth: last ? 0 : 1,
        borderColor: colors.line,
      }}
    >
      {selecting ? (
        <Pressable
          onPress={selection?.onSelect}
          disabled={!canPick}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: picked, disabled: !canPick }}
          accessibilityLabel={`Select ${item.title}`}
          hitSlop={8}
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            borderWidth: picked ? 0 : 1.6,
            borderColor: canPick ? colors.royal : colors.line,
            backgroundColor: picked ? colors.blue : "transparent",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {picked ? <Icon name="check" size={14} color="#fff" /> : null}
        </Pressable>
      ) : (
        <Circle
          done={done || closed}
          wont={item.status === "wont"}
          onPress={onToggle}
          disabled={readOnly}
          label={done || closed ? `Mark ${item.title} not done` : `Mark ${item.title} done`}
        />
      )}
      <Pressable
        onPress={selecting ? selection?.onSelect : onOpen}
        onLongPress={!selecting && canPick ? selection?.onSelect : undefined}
        delayLongPress={350}
        disabled={selecting ? !canPick : !onOpen && !canPick}
        accessibilityRole="button"
        accessibilityLabel={selecting ? `Select ${item.title}` : `Open ${item.title}`}
        accessibilityHint={!selecting && canPick ? "Press and hold to select several" : undefined}
        style={{ flex: 1, minWidth: 0, gap: 2 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text
            numberOfLines={1}
            style={{
              fontSize: 15,
              color: done || closed ? colors.faint : colors.ink,
              textDecorationLine: done || closed ? "line-through" : "none",
              flexShrink: 1,
            }}
          >
            {item.title}
          </Text>
          {item.kind !== "todo" ? <Tag>{item.kind === "habit" ? "Habit" : "Goal"}</Tag> : null}
          {item.visibility === "owner" ? (
            <View accessible accessibilityLabel="Only you can see this">
              <Icon name="lock" size={12} color={colors.faint} />
            </View>
          ) : null}
          {item.notes ? (
            <View accessible accessibilityLabel="Has notes">
              <Icon name="file-text" size={12} color={colors.faint} />
            </View>
          ) : null}
        </View>
        {meta || item.status === "wont" ? (
          <Text numberOfLines={1} style={{ fontSize: 12, color: colors.sub }}>
            {item.status === "wont" ? "Won't do" : meta}
          </Text>
        ) : null}
      </Pressable>
      {due && !closed ? (
        <Text style={{ fontSize: 13, color: due.late && !done ? colors.danger : colors.sub }}>
          {due.text}
        </Text>
      ) : null}
    </View>
  );
}

export function Tag({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "blue" }) {
  return (
    <View
      style={{
        borderRadius: 5,
        paddingHorizontal: 6,
        paddingVertical: 1,
        backgroundColor: tone === "blue" ? colors.tint : colors.surface,
        borderWidth: 1,
        borderColor: tone === "blue" ? colors.tint : colors.line,
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: "600", color: tone === "blue" ? colors.blue : colors.sub }}>
        {children}
      </Text>
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return (
    <View
      style={[
        {
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: radius.card,
          paddingHorizontal: space.lg,
          backgroundColor: colors.card,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** The floating + in the bottom-right corner, in the same spot on every platform. */
export function Fab({ onPress, label, bottom = 0 }: { onPress: () => void; label: string; bottom?: number }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        position: "absolute",
        right: 20,
        bottom: bottom + 20,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: colors.royal,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.85 : 1,
        shadowColor: "#1a2a6e",
        shadowOpacity: 0.3,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 6,
      })}
    >
      <Icon name="plus" size={26} color="#fff" />
    </Pressable>
  );
}

/** A pull-up sheet on phones; a centered dialog on wide screens. */
export function Sheet({
  visible,
  onClose,
  title,
  children,
  wide,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType={wide ? "fade" : "slide"} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View
          style={{
            flex: 1,
            justifyContent: wide ? "center" : "flex-end",
            alignItems: wide ? "center" : "stretch",
          }}
        >
          {/* The backdrop sits behind the sheet, not around it, so clicks inside (on a field, say) never close it. */}
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(15, 20, 35, 0.35)" }]}
          />
          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: radius.sheet,
              borderBottomLeftRadius: wide ? radius.sheet : 0,
              borderBottomRightRadius: wide ? radius.sheet : 0,
              padding: space.xl,
              paddingBottom: space.xl + (wide ? 0 : insets.bottom),
              gap: space.lg,
              width: wide ? 460 : "100%",
            }}
          >
            {!wide ? (
              <View
                style={{
                  alignSelf: "center",
                  width: 36,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: colors.line,
                }}
              />
            ) : null}
            <Text style={{ fontSize: 20, fontWeight: "700", color: colors.ink, letterSpacing: -0.3 }}>
              {title}
            </Text>
            {children}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function ChipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ gap: space.sm }}>
      <Text style={{ fontSize: 12, fontWeight: "600", color: colors.sub }}>{label}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>{children}</View>
    </View>
  );
}

export function Chip({
  on,
  onPress,
  children,
  leading,
}: {
  on: boolean;
  onPress: () => void;
  children: string;
  leading?: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: on ? colors.royal : colors.line,
        backgroundColor: on ? colors.tint : colors.card,
      }}
    >
      {leading}
      <Text style={{ fontSize: 13, fontWeight: "600", color: on ? colors.blue : colors.sub }}>
        {children}
      </Text>
    </Pressable>
  );
}

/** A small blue dot: something new in this space. */
export function UnreadDot() {
  return (
    <View
      accessible
      accessibilityLabel="New messages"
      style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.blue }}
    />
  );
}
