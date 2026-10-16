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
  /** A compliment that didn't go through; the profile stays on screen. */
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let current = true;
    setProfile(null);
    setError("");
    getProfile(userId)
      .then((p) => current && setProfile(p))
      .catch((e: Error) => current && setError(e.message));
    return () => {
      current = false;
    };
  }, [userId]);
  if (error) return <Text style={{ fontSize: 13, color: colors.faint }}>{error}</Text>;
  if (!profile) return null;
  const counts = new Map(profile.compliments.map((c) => [c.tag, c.count]));
  /** Apply one compliment change to a profile, so quick taps on different chips all count. */
  const flip = (p: PersonProfile, tag: ComplimentTag, on: boolean): PersonProfile => {
    if (p.mine.includes(tag) === on) return p;
    const n = (p.compliments.find((c) => c.tag === tag)?.count ?? 0) + (on ? 1 : -1);
    const others = p.compliments.filter((c) => c.tag !== tag);
    return {
      ...p,
      mine: on ? [...p.mine, tag] : p.mine.filter((t) => t !== tag),
      compliments: n > 0 ? [...others, { tag, count: n }] : others,
    };
  };
  const toggle = async (tag: ComplimentTag) => {
    const on = !profile.mine.includes(tag);
    setNotice("");
    // Show it at once; undo just this one if the server says no.
    setProfile((p) => (p ? flip(p, tag, on) : p));
    try {
      await setCompliment(userId, tag, on);
    } catch (e) {
      setProfile((p) => (p ? flip(p, tag, !on) : p));
      setNotice((e as Error).message);
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
                    backgroundColor: mine ? colors.tint : colors.card,
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
          {notice ? <Text style={{ fontSize: 12, color: colors.faint }}>{notice}</Text> : null}
        </View>
      )}
    </View>
  );
}
