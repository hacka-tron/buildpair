import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SITE_URL } from "../lib/config";
import { colors, radius, space, type } from "../lib/theme";

export function Screen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      {children}
    </SafeAreaView>
  );
}

export function Button({
  label,
  onPress,
  kind = "primary",
  busy = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  kind?: "primary" | "secondary" | "danger";
  busy?: boolean;
  disabled?: boolean;
}) {
  const primary = kind !== "secondary";
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.primary : styles.secondary,
        kind === "danger" && { backgroundColor: colors.danger },
        (disabled || busy) && { opacity: 0.5 },
        pressed && { opacity: 0.8 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={primary ? "#fff" : colors.blue} />
      ) : (
        <Text style={[styles.buttonText, { color: primary ? "#fff" : colors.blue }]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label?: string }) {
  const { label, style, ...rest } = props;
  return (
    <View style={{ gap: space.xs }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput placeholderTextColor={colors.faint} style={[styles.field, style]} {...rest} />
    </View>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return children ? (
    <Text accessibilityRole="alert" style={styles.error}>
      {children}
    </Text>
  ) : null;
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  button: {
    borderRadius: radius.control,
    minHeight: 46,
    paddingVertical: 12,
    paddingHorizontal: space.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: { backgroundColor: colors.blue },
  secondary: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.line },
  buttonText: { fontSize: type.body, fontWeight: "600" },
  label: { fontSize: 13, fontWeight: "600", color: colors.sub },
  field: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.control,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    // 16px keeps iOS from zooming into the field.
    fontSize: 16,
    color: colors.ink,
    backgroundColor: "#fff",
    outlineColor: colors.royal,
  },
  error: { color: colors.danger, fontSize: type.secondary },
  title: { fontSize: type.title, fontWeight: "700", letterSpacing: -0.4, color: colors.ink },
  sub: { fontSize: type.secondary, color: colors.sub },
});

/** Links to the privacy and terms pages on the landing site. */
export function LegalLinks() {
  const open = (path: string) => void Linking.openURL(`${SITE_URL}${path}`);
  return (
    <View style={{ flexDirection: "row", justifyContent: "center", gap: 16, paddingVertical: 8 }}>
      <Pressable onPress={() => open("/privacy")} accessibilityRole="link" hitSlop={8}>
        <Text style={{ fontSize: 13, color: colors.sub }}>Privacy</Text>
      </Pressable>
      <Pressable onPress={() => open("/terms")} accessibilityRole="link" hitSlop={8}>
        <Text style={{ fontSize: 13, color: colors.sub }}>Terms</Text>
      </Pressable>
    </View>
  );
}
