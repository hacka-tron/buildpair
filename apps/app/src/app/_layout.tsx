import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useRef } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { authClient } from "../lib/auth";
import { colors } from "../lib/theme";

export default function RootLayout() {
  const { data: session, isPending } = authClient.useSession();
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
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="index" options={{ animation: "none" }} />
          <Stack.Screen name="spaces/index" options={{ animation: "none" }} />
          <Stack.Screen name="spaces/[id]" />
          <Stack.Screen name="join/[token]" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
      </Stack>
    </SafeAreaProvider>
  );
}
