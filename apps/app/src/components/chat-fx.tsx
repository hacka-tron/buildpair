import { type ReactNode, useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, Platform } from "react-native";

/**
 * The small motions that make the chat feel alive (see docs/design/chat-study.md). Everything here stays
 * still when the device asks for reduced motion.
 */

// The web has no native animation driver; asking for it there only logs a warning.
const native = Platform.OS !== "web";

let reduced = false;
void AccessibilityInfo.isReduceMotionEnabled?.()
  .then((on) => {
    reduced = on;
  })
  .catch(() => undefined);
AccessibilityInfo.addEventListener?.("reduceMotionChanged", (on) => {
  reduced = on;
});

/** Grows in from slightly small, once, when `animate` is true at first render. */
export function PopIn(props: { animate: boolean; children: ReactNode; from?: "left" | "right" | "center" }) {
  const progress = useRef(new Animated.Value(props.animate && !reduced ? 0 : 1)).current;
  useEffect(() => {
    if (!props.animate || reduced) return;
    Animated.spring(progress, { toValue: 1, friction: 6, tension: 120, useNativeDriver: native }).start();
  }, [props.animate, progress]);
  const shift = props.from === "right" ? 16 : props.from === "left" ? -16 : 0;
  return (
    <Animated.View
      style={{
        opacity: progress,
        transform: [
          { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
          { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [shift, 0] }) },
        ],
      }}
    >
      {props.children}
    </Animated.View>
  );
}
