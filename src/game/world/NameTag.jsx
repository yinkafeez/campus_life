import { useMemo } from "react";
import { textTexture } from "./textTexture";

// A floating name above a character (always faces the camera).
export default function NameTag({ text, y = 2.15, tone = "player" }) {
  const texture = useMemo(
    () =>
      textTexture(text, {
        width: 384,
        height: 96,
        size: 44,
        background:
          tone === "npc" ? "rgba(120, 72, 0, 0.82)" : "rgba(8, 17, 13, 0.72)",
        border: tone === "npc" ? "#f5b70a" : null,
      }),
    [text, tone],
  );
  return (
    <sprite position={[0, y, 0]} scale={[1.6, 0.4, 1]}>
      <spriteMaterial
        map={texture}
        depthWrite={false}
        transparent
        toneMapped={false}
      />
    </sprite>
  );
}
