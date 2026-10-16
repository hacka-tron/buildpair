import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Button, Screen, styles } from "../../components/ui";
import { acceptInvite } from "../../lib/api";
import { refreshSpaces } from "../../lib/spaces";
import { colors, space } from "../../lib/theme";

/** buildpair.app/join/<token>: asks to join the space, or opens it if you're already in. */
export default function Join() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [error, setError] = useState("");
  const [asked, setAsked] = useState("");

  useEffect(() => {
    acceptInvite(token)
      .then(({ spaceId, spaceName, status }) => {
        if (status === "requested") return setAsked(spaceName);
        void refreshSpaces();
        router.replace({ pathname: "/spaces/[id]", params: { id: spaceId } });
      })
      .catch((e: Error) => setError(e.message));
  }, [token]);

  return (
    <Screen>
      <View
        style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: space.lg, padding: space.xl }}
      >
        {asked ? (
          <>
            <Text style={[styles.sub, { textAlign: "center" }]}>
              You asked to join {asked}. It shows up in your spaces once the owner lets you in.
            </Text>
            <Button label="Go to your spaces" onPress={() => router.replace("/")} />
          </>
        ) : error ? (
          <>
            <Text style={[styles.sub, { textAlign: "center" }]}>{error}</Text>
            <Button label="Go to your spaces" onPress={() => router.replace("/")} />
          </>
        ) : (
          <>
            <ActivityIndicator color={colors.blue} />
            <Text style={styles.sub}>Joining the space…</Text>
          </>
        )}
      </View>
    </Screen>
  );
}
