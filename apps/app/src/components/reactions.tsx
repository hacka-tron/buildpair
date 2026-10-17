import { useEffect, useRef, useState } from "react";
import { Animated, Platform, Pressable, Text, View } from "react-native";
import { colors } from "../lib/theme";

/**
 * Reactions the way Teams does them: a small floating bar of quick reactions appears on a message's top
 * edge when you hover it (or press and hold on a phone), each emoji grows under the pointer, and the
 * reactions sit as pills hanging off the message's bottom edge. A new reaction lands with a bounce, and
 * hovering a pill shows who reacted.
 */

export const QUICK_REACTIONS = ["👍", "❤️", "🔥", "😂", "🙌", "👏"];

const native = Platform.OS !== "web";

/** One emoji in the bar: grows when pointed at or pressed. */
function BarEmoji(props: { emoji: string; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v: number) =>
    Animated.spring(scale, { toValue: v, friction: 5, tension: 220, useNativeDriver: native }).start();
  return (
    <Pressable
      onPress={props.onPress}
      onHoverIn={() => to(1.35)}
      onHoverOut={() => to(1)}
      onPressIn={() => to(1.2)}
      onPressOut={() => to(1)}
      accessibilityRole="button"
      accessibilityLabel={`React ${props.emoji}`}
      style={{ paddingHorizontal: 5, paddingVertical: 4 }}
    >
      <Animated.Text style={{ fontSize: 20, transform: [{ scale }] }}>{props.emoji}</Animated.Text>
    </Pressable>
  );
}

/**
 * The floating bar of quick reactions. `side` is the edge it hugs (the side away from the sender's
 * avatar), and it fades and slides in when it appears.
 */
export function ReactionBar(props: {
  visible: boolean;
  side: "left" | "right";
  onReact: (emoji: string) => void;
  /** Missing for your own messages. */
  onReport?: () => void;
}) {
  const v = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(props.visible);
  useEffect(() => {
    if (props.visible) setMounted(true);
    Animated.timing(v, { toValue: props.visible ? 1 : 0, duration: 140, useNativeDriver: native }).start(
      ({ finished }) => {
        if (finished && !props.visible) setMounted(false);
      },
    );
  }, [props.visible, v]);
  if (!mounted) return null;
  return (
    <Animated.View
      style={{
        position: "absolute",
        top: -34,
        [props.side]: 6,
        zIndex: 10,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 4,
        borderRadius: 999,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.line,
        shadowColor: "#000",
        shadowOpacity: 0.18,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 3 },
        elevation: 6,
        opacity: v,
        transform: [
          { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) },
          { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
        ],
      }}
    >
      {QUICK_REACTIONS.map((e) => (
        <BarEmoji key={e} emoji={e} onPress={() => props.onReact(e)} />
      ))}
      {props.onReport ? (
        <Pressable
          onPress={props.onReport}
          accessibilityRole="button"
          hitSlop={6}
          style={{
            paddingHorizontal: 8,
            paddingVertical: 6,
            borderLeftWidth: 1,
            borderColor: colors.line,
            marginLeft: 2,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: "600", color: colors.sub }}>Report</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

/** One pill: emoji and count. It bounces when its count changes after it first showed. */
function Pill(props: {
  emoji: string;
  users: string[];
  mine: boolean;
  names: string;
  bounce: boolean;
  onPress: () => void;
}) {
  const pop = useRef(new Animated.Value(props.bounce ? 0 : 1)).current;
  const [tip, setTip] = useState(false);
  useEffect(() => {
    if (!props.bounce) return;
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, friction: 4, tension: 160, useNativeDriver: native }).start();
  }, [props.bounce, pop]);
  const emojiScale = pop.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.4, 1.35, 1] });
  return (
    <View>
      {tip ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            bottom: 30,
            left: 0,
            zIndex: 20,
            backgroundColor: colors.bar,
            borderRadius: 8,
            paddingHorizontal: 8,
            paddingVertical: 5,
            minWidth: 80,
            maxWidth: 220,
          }}
        >
          <Text style={{ fontSize: 12, color: "#fff" }}>
            {props.emoji} {props.names}
          </Text>
        </View>
      ) : null}
      <Pressable
        onPress={props.onPress}
        onHoverIn={() => setTip(true)}
        onHoverOut={() => setTip(false)}
        accessibilityRole="button"
        accessibilityLabel={`${props.emoji} ${props.users.length}, from ${props.names}`}
        style={({ pressed }: { pressed: boolean }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: 3,
          height: 24,
          paddingHorizontal: 7,
          borderRadius: 999,
          // A ring in the page color makes the pill look cut into the bubble it hangs from.
          borderWidth: 2,
          borderColor: colors.bg,
          backgroundColor: props.mine ? colors.tint : colors.card,
          transform: [{ scale: pressed ? 0.92 : 1 }],
        })}
      >
        <Animated.Text style={{ fontSize: 13, transform: [{ scale: emojiScale }] }}>
          {props.emoji}
        </Animated.Text>
        <Text style={{ fontSize: 12, fontWeight: "600", color: props.mine ? colors.blue : colors.sub }}>
          {props.users.length}
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * The reactions on a message, as pills overlapping its bottom edge. Reactions already there when it first
 * shows stay still; ones added later bounce in.
 */
export function ReactionSummary(props: {
  reactions: Record<string, string[]>;
  userId: string;
  nameOf: (userId: string) => string;
  align: "flex-start" | "flex-end";
  onReact: (emoji: string) => void;
}) {
  const first = useRef<Record<string, number> | null>(null);
  if (first.current === null)
    first.current = Object.fromEntries(Object.entries(props.reactions).map(([e, u]) => [e, u.length]));
  const entries = Object.entries(props.reactions);
  if (entries.length === 0) return null;
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 3,
        alignSelf: props.align,
        marginTop: -10,
        marginHorizontal: 8,
        zIndex: 5,
      }}
    >
      {entries.map(([emoji, users]) => (
        <Pill
          // A new count remounts the pill, so it bounces.
          key={`${emoji}-${users.length}`}
          emoji={emoji}
          users={users}
          mine={users.includes(props.userId)}
          names={users.map(props.nameOf).join(", ")}
          bounce={first.current?.[emoji] !== users.length}
          onPress={() => props.onReact(emoji)}
        />
      ))}
    </View>
  );
}
