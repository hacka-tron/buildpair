import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { type ComplimentTag, getProfile, type PersonProfile, setCompliment } from "../lib/api";
import { colors, space } from "../lib/theme";
import { Tag } from "./kit";

export const COMPLIMENT_LABELS: Record<ComplimentTag, string> = {
  honest: "Honest takes",
  keeps_me_going: "Keeps me going",
  friendly: "Friendly",
  great_advice: "Great advice",
  checks_in: "Always checks in",
};
const BADGE_LABELS: Record<string, string> = {
  finisher: "Finisher",
  reliable_supporter: "Reliable supporter",
};

/** "Supporting 4 people · supported by 6 · 12 goals finished", leaving out the zeros. */
export function statsLine(s: PersonProfile["stats"]): string {
  const parts = [
    s.supporting ? `Supporting ${s.supporting} ${s.supporting === 1 ? "space" : "spaces"}` : "",
    s.supportedBy ? `supported by ${s.supportedBy}` : "",
    s.goalsFinished ? `${s.goalsFinished} ${s.goalsFinished === 1 ? "goal" : "goals"} finished` : "",
  ].filter(Boolean);
  const line = parts.join(" · ");
  return line ? line[0]!.toUpperCase() + line.slice(1) : "Just getting started";
}

/**
 * What someone's building, their numbers, badges and compliments. On someone else's profile you can give
 * or take back your own compliments.
 */
export function ProfileSummary({ userId, self }: { userId: string; self: boolean }) {
  const [profile, setProfile] = useState<PersonProfile | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    getProfile(userId)
      .then(setProfile)
      .catch((e: Error) => setError(e.message));
  }, [userId]);
  if (error) return <Text style={{ fontSize: 13, color: colors.faint }}>{error}</Text>;
  if (!profile) return null;
  const counts = new Map(profile.compliments.map((c) => [c.tag, c.count]));
  const toggle = async (tag: ComplimentTag) => {
    const on = !profile.mine.includes(tag);
    // Show it at once; put it back if the server says no.
    const before = profile;
    setProfile({
      ...profile,
      mine: on ? [...profile.mine, tag] : profile.mine.filter((t) => t !== tag),
      compliments: Object.entries(COMPLIMENT_LABELS)
        .map(([t]) => ({
          tag: t as ComplimentTag,
          count: (counts.get(t as ComplimentTag) ?? 0) + (t === tag ? (on ? 1 : -1) : 0),
        }))
        .filter((c) => c.count > 0),
    });
    try {
      await setCompliment(userId, tag, on);
    } catch (e) {
      setProfile(before);
      setError((e as Error).message);
    }
  };
  return (
    <View style={{ gap: space.sm }}>
      {profile.building ? (
        <Text style={{ fontSize: 14, color: colors.ink, lineHeight: 20 }}>Building {profile.building}</Text>
      ) : null}
      <Text style={{ fontSize: 13, color: colors.sub }}>{statsLine(profile.stats)}</Text>
      {profile.badges.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {profile.badges.map((b) => (
            <Tag key={b} tone="blue">
              {BADGE_LABELS[b] ?? b}
            </Tag>
          ))}
        </View>
      ) : null}
      {self ? (
        profile.compliments.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {profile.compliments.map((c) => (
              <Tag key={c.tag}>{`${COMPLIMENT_LABELS[c.tag]} · ${c.count}`}</Tag>
            ))}
          </View>
        ) : (
          <Text style={{ fontSize: 13, color: colors.faint }}>
            Compliments from your supporters show up here.
          </Text>
        )
      ) : (
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 12, fontWeight: "700", color: colors.ink }}>Compliments</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {(Object.keys(COMPLIMENT_LABELS) as ComplimentTag[]).map((tag) => {
              const mine = profile.mine.includes(tag);
              const n = counts.get(tag) ?? 0;
              return (
                <Pressable
                  key={tag}
                  onPress={() => void toggle(tag)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: mine }}
                  accessibilityLabel={`${COMPLIMENT_LABELS[tag]}${mine ? ", from you" : ""}`}
                  style={{
                    borderWidth: 1,
                    borderColor: mine ? colors.royal : colors.line,
                    backgroundColor: mine ? colors.tint : "#fff",
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "600", color: mine ? colors.blue : colors.sub }}>
                    {COMPLIMENT_LABELS[tag]}
                    {n ? ` · ${n}` : ""}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}
