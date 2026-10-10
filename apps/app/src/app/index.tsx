import { Link } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { Button, ErrorText, Field, Screen, styles } from "../components/ui";
import { createSpace, listSpaces, type SpaceSummary } from "../lib/api";
import { authClient } from "../lib/auth";
import { colors, radius, space } from "../lib/theme";
import { stopAllSyncs } from "../lib/use-space";

const SPACE_COLORS = ["#3557D6", "#2F8F5B", "#C0392B", "#7A4FB5", "#C47F0C", "#1F7A8C"];
const colorFor = (id: string) =>
  SPACE_COLORS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % SPACE_COLORS.length]!;

export default function Spaces() {
  const [spaces, setSpaces] = useState<SpaceSummary[] | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError("");
      setSpaces((await listSpaces()).spaces);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setBusy(true);
    try {
      const s = await createSpace(name.trim(), purpose.trim());
      setSpaces((prev) => [s, ...(prev ?? [])]);
      setCreating(false);
      setName("");
      setPurpose("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View
        style={{
          flex: 1,
          padding: space.lg,
          gap: space.md,
          maxWidth: 720,
          width: "100%",
          alignSelf: "center",
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={styles.title}>Spaces</Text>
          <Pressable
            onPress={async () => {
              stopAllSyncs();
              await authClient.signOut();
            }}
            accessibilityRole="button"
          >
            <Text style={[styles.sub, { color: colors.blue, fontWeight: "600" }]}>Sign out</Text>
          </Pressable>
        </View>
        <ErrorText>{error}</ErrorText>

        {creating ? (
          <View
            style={{
              gap: space.md,
              padding: space.md,
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: radius.card,
            }}
          >
            <Field label="Name" value={name} onChangeText={setName} placeholder="Life" maxLength={60} />
            <Field
              label="What it's for"
              value={purpose}
              onChangeText={setPurpose}
              placeholder="Family, health and the house"
              maxLength={280}
            />
            <View style={{ flexDirection: "row", gap: space.sm }}>
              <View style={{ flex: 1 }}>
                <Button
                  label="Create space"
                  onPress={create}
                  busy={busy}
                  disabled={!name.trim() || !purpose.trim()}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Cancel" kind="secondary" onPress={() => setCreating(false)} />
              </View>
            </View>
          </View>
        ) : (
          <Button label="New space" kind="secondary" onPress={() => setCreating(true)} />
        )}

        <FlatList
          data={spaces ?? []}
          keyExtractor={(s) => s.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
            />
          }
          ListEmptyComponent={
            spaces ? (
              <Text style={[styles.sub, { textAlign: "center", marginTop: space.xl }]}>
                No spaces yet. Make one for something you're working on, then invite someone to keep you
                honest.
              </Text>
            ) : null
          }
          renderItem={({ item }) => (
            <Link href={{ pathname: "/spaces/[id]", params: { id: item.id } }} asChild>
              <Pressable
                style={{
                  flexDirection: "row",
                  gap: space.md,
                  alignItems: "center",
                  paddingVertical: space.md,
                  borderBottomWidth: 1,
                  borderColor: colors.line,
                }}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    backgroundColor: colorFor(item.id),
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
                    {item.name.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 15, fontWeight: "600", color: colors.ink }} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.sub} numberOfLines={1}>
                    {item.purpose}
                  </Text>
                </View>
                {item.role === "supporter" ? <Text style={styles.sub}>Supporting</Text> : null}
              </Pressable>
            </Link>
          )}
        />
      </View>
    </Screen>
  );
}
