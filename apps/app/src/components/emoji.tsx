import { Image, Text } from "react-native";

/**
 * Reaction emoji drawn from Fluent Emoji (Microsoft, MIT; see assets/emoji/LICENSE.txt), the 3D set Teams
 * uses, so reactions look like Buildpair's own rather than whatever the device's emoji font draws. Emoji
 * without an image fall back to the font.
 */
const IMAGES: Record<string, number> = {
  "👍": require("../../assets/emoji/thumbs-up.png"),
  "❤️": require("../../assets/emoji/red-heart.png"),
  "🔥": require("../../assets/emoji/fire.png"),
  "😂": require("../../assets/emoji/tears-of-joy.png"),
  "🙌": require("../../assets/emoji/raising-hands.png"),
  "👏": require("../../assets/emoji/clapping-hands.png"),
};

export function Emoji(props: { emoji: string; size: number }) {
  const image = IMAGES[props.emoji];
  if (!image)
    return <Text style={{ fontSize: props.size * 0.85, lineHeight: props.size * 1.1 }}>{props.emoji}</Text>;
  return (
    <Image
      source={image}
      accessible
      accessibilityLabel={props.emoji}
      style={{ width: props.size, height: props.size }}
    />
  );
}
