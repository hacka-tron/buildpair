import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useRef } from "react";
import { ActivityIndicator, Platform, useColorScheme, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { authClient } from "../lib/auth";
import { colors, type Scheme, setScheme } from "../lib/theme";
import { useInbox } from "../lib/use-space";

/** On the web, `?theme=dark` or `?theme=light` overrides the device setting (handy for checking both). */
const forced: Scheme | null = (() => {
  if (Platform.OS !== "web" || typeof location === "undefined") return null;
  const t = new URLSearchParams(location.search).get("theme");
  return t === "dark" || t === "light" ? t : null;
})();

export default function RootLayout() {
  const device = useColorScheme();
  const scheme: Scheme = forced ?? (device === "dark" ? "dark" : "light");
  // Set before anything renders, so every screen reads the right palette.
  setScheme(scheme);
  const { data: session, isPending } = authClient.useSession();
  useInbox(session?.user.id ?? "");
  // Only the first check shows the spinner. Later checks (after signing up, say) keep the screen and its state.
  const loaded = useRef(false);
  if (!isPending) loaded.current = true;
  if (isPending && !loaded.current) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.blue} />
      </View>
    );
  }
  const signedIn = Boolean(session);
  return (
    <SafeAreaProvider>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack
        key={scheme}
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}
      >
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="index" options={{ animation: "none" }} />
          <Stack.Screen name="spaces/index" options={{ animation: "none" }} />
          <Stack.Screen name="spaces/[id]" />
          <Stack.Screen name="join/[token]" />
          <Stack.Screen name="profile" />
          <Stack.Screen name="supporting" options={{ animation: "none" }} />
          <Stack.Screen name="activity" />
          <Stack.Screen name="upcoming" options={{ animation: "none" }} />
          <Stack.Screen name="discover" options={{ animation: "none" }} />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
      </Stack>
    </SafeAreaProvider>
  );
}
