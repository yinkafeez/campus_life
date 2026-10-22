import { useMemo } from "react";
import { textTexture } from "./textTexture";

// A campus name board on two posts, facing +Z (rotate the group to face a path).
export default function Sign({ text, position, rotationY = 0, width = 4 }) {
  const texture = useMemo(() => textTexture(text), [text]);
  const height = width / 4;

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {[-width / 2 + 0.15, width / 2 - 0.15].map((x) => (
        <mesh key={x} position={[x, 0.75, 0]}>
          <boxGeometry args={[0.12, 1.5, 0.12]} />
          <meshStandardMaterial color="#374151" />
        </mesh>
      ))}
      <mesh position={[0, 1.5 + height / 2, 0]}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      {/* back of the board */}
      <mesh position={[0, 1.5 + height / 2, -0.03]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial color="#12352a" />
      </mesh>
    </group>
  );
}
