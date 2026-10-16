import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { Card, SpaceTile, Tag } from "../components/kit";
import { PageHeader, Shell, useWide } from "../components/shell";
import { Button, ErrorText } from "../components/ui";
import { type Listing, listDiscover, offerSupport } from "../lib/api";
import { colors, radius, space } from "../lib/theme";

/** Spaces other people chose to show, and a way to offer them support. */
export default function Discover() {
  const wide = useWide();
  const [query, setQuery] = useState("");
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (q: string) => {
    try {
      setListings((await listDiscover(q)).listings);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    const t = setTimeout(() => void load(query), 250);
    return () => clearTimeout(t);
  }, [query, load]);

  return (
    <Shell active="discover">
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load(query);
              setRefreshing(false);
            }}
          />
        }
        contentContainerStyle={{
          padding: wide ? space.xxl : space.lg,
          paddingBottom: 120,
          maxWidth: 760,
          width: "100%",
          alignSelf: wide ? "flex-start" : "center",
          gap: space.md,
        }}
      >
        <PageHeader title="Discover" sub="People building things who'd like support" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name or what it's for"
          placeholderTextColor={colors.faint}
          accessibilityLabel="Search Discover"
          style={{
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: radius.control,
            paddingHorizontal: space.md,
            paddingVertical: 11,
            fontSize: 16,
            color: colors.ink,
            backgroundColor: "#fff",
            outlineColor: colors.royal,
          }}
        />
        <ErrorText>{error}</ErrorText>
        {listings && listings.length === 0 ? (
          <Text style={{ fontSize: 14, color: colors.sub, lineHeight: 20 }}>
            {query.trim()
              ? "Nothing matches that yet."
              : "No spaces here yet. Owners can show theirs from the space's settings."}
          </Text>
        ) : null}
        {(listings ?? []).map((l) => (
          <ListingCard
            key={l.spaceId}
            listing={l}
            onOffered={() =>
              setListings((ls) =>
                (ls ?? []).map((x) => (x.spaceId === l.spaceId ? { ...x, asked: true } : x)),
              )
            }
          />
        ))}
      </ScrollView>
    </Shell>
  );
}

function ListingCard({ listing: l, onOffered }: { listing: Listing; onOffered: () => void }) {
  const [writing, setWriting] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const send = async () => {
    setBusy(true);
    setError("");
    try {
      await offerSupport(l.spaceId, note.trim());
      setWriting(false);
      onOffered();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <View style={{ gap: space.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <SpaceTile id={l.spaceId} name={l.name} size={40} color={null} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: "700", color: colors.ink }}>
              {l.name}
            </Text>
            <Text style={{ fontSize: 13, color: colors.sub }}>
              {l.ownerName}
              {l.people > 1 ? ` + ${l.people - 1} ${l.people === 2 ? "supporter" : "supporters"}` : ""}
            </Text>
          </View>
        </View>
        <Text style={{ fontSize: 14, color: colors.ink, lineHeight: 20 }}>{l.purpose}</Text>
        {l.goals.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {l.goals
              .filter((g, i, all) => all.findIndex((x) => x.title === g.title) === i)
              .map((g) => (
                <Tag key={g.title} tone="blue">
                  {g.title}
                </Tag>
              ))}
          </View>
        ) : null}
        {l.asked ? (
          <Text style={{ fontSize: 13, color: colors.sub }}>
            Offer sent. {l.ownerName} decides who joins.
          </Text>
        ) : writing ? (
          <View style={{ gap: space.sm }}>
            <TextInput
              autoFocus
              value={note}
              onChangeText={setNote}
              placeholder={`Say hi to ${l.ownerName}, and why you'd like to support this (optional)`}
              placeholderTextColor={colors.faint}
              multiline
              maxLength={280}
              style={{
                borderWidth: 1,
                borderColor: colors.line,
                borderRadius: radius.control,
                paddingHorizontal: space.md,
                paddingVertical: 10,
                fontSize: 16,
                minHeight: 64,
                textAlignVertical: "top",
                color: colors.ink,
                outlineColor: colors.royal,
              }}
            />
            <ErrorText>{error}</ErrorText>
            <View style={{ flexDirection: "row", gap: space.sm }}>
              <View style={{ flex: 1 }}>
                <Button label="Cancel" kind="secondary" onPress={() => setWriting(false)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Send offer" busy={busy} onPress={send} />
              </View>
            </View>
          </View>
        ) : (
          <Button label="Offer support" kind="secondary" onPress={() => setWriting(true)} />
        )}
      </View>
    </Card>
  );
}
