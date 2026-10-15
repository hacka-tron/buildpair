import { SpaceColor } from "@buildpair/protocol";
import type { Change } from "@buildpair/sync";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { colors, SPACE_SHADES, space, spaceColor } from "../lib/theme";
import { Icon, Sheet } from "./kit";
import { Button, ErrorText, Field } from "./ui";

/** The owner's settings for a space: its name, what it's for, and its color. */
export function SpaceSettings(props: {
  spaceId: string;
  name: string;
  purpose: string;
  color: SpaceColor | null;
  wide: boolean;
  onClose: () => void;
  /** Applies a change; returns why it didn't happen, or null. */
  apply: (change: Change) => string | null;
  onSaved: (patch: { name: string; purpose: string; color: SpaceColor | null }) => void;
}) {
  const [name, setName] = useState(props.name);
  const [purpose, setPurpose] = useState(props.purpose);
  const [color, setColor] = useState<SpaceColor | null>(props.color);
  const [error, setError] = useState("");
  const shown = spaceColor(props.spaceId, color);
  const save = () => {
    if (!name.trim() || !purpose.trim()) return;
    const problem = props.apply({
      type: "space.edit",
      payload: { name: name.trim(), purpose: purpose.trim(), ...(color ? { color } : {}) },
    });
    if (problem) return setError(problem);
    props.onSaved({ name: name.trim(), purpose: purpose.trim(), color });
    props.onClose();
  };
  return (
    <Sheet visible onClose={props.onClose} title="Space settings" wide={props.wide}>
      <Field label="Name" value={name} onChangeText={setName} maxLength={60} />
      <Field label="What it's for" value={purpose} onChangeText={setPurpose} maxLength={280} />
      <View style={{ gap: space.sm }}>
        <Text style={{ fontSize: 12, fontWeight: "600", color: colors.sub }}>Color</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {SpaceColor.options.map((c) => {
            const on = SPACE_SHADES[c] === shown;
            return (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={c}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: SPACE_SHADES[c],
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: on ? 3 : 0,
                  borderColor: "#fff",
                  outlineColor: SPACE_SHADES[c],
                  outlineWidth: on ? 2 : 0,
                  outlineStyle: "solid",
                }}
              >
                {on ? <Icon name="check" size={16} color="#fff" /> : null}
              </Pressable>
            );
          })}
        </View>
      </View>
      <ErrorText>{error}</ErrorText>
      <Button label="Save" onPress={save} disabled={!name.trim() || !purpose.trim()} />
    </Sheet>
  );
}
