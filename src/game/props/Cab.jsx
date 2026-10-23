import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { materialFor } from "../character/materials";
import { textTexture } from "../world/textTexture";

/*
 * A Lagos-style yellow cab (original low-poly model): body, cabin glass, black side stripe,
 * roof light, four wheels. Faces +Z. Optional floating marker for a terminal / pick-up point.
 */
const YELLOW = "#f2c200";

function Wheel({ x, z }) {
  return (
    <mesh
      position={[x, 0.36, z]}
      rotation={[0, 0, Math.PI / 2]}
      material={materialFor("#111827", { roughness: 0.9 })}
    >
      <cylinderGeometry args={[0.36, 0.36, 0.28, 14]} />
    </mesh>
  );
}

export function Cab({ color = YELLOW }) {
  return (
    <group>
      <mesh
        position={[0, 0.72, 0]}
        material={materialFor(color, { roughness: 0.45, metalness: 0.2 })}
      >
        <boxGeometry args={[1.8, 0.7, 4.3]} />
      </mesh>
      {/* cabin */}
      <mesh
        position={[0, 1.33, -0.2]}
        material={materialFor(color, { roughness: 0.45 })}
      >
        <boxGeometry args={[1.66, 0.55, 2.3]} />
      </mesh>
      <mesh
        position={[0, 1.34, -0.2]}
        material={materialFor("#1f2937", { roughness: 0.15, metalness: 0.4 })}
      >
        <boxGeometry args={[1.7, 0.42, 2.12]} />
      </mesh>
      {/* the black stripe Lagos cabs are known for */}
      <mesh position={[0, 0.78, 0]} material={materialFor("#111111")}>
        <boxGeometry args={[1.82, 0.14, 4.0]} />
      </mesh>
      <mesh position={[0, 1.7, -0.3]} material={materialFor("#fef3c7")}>
        <boxGeometry args={[0.55, 0.16, 0.25]} />
      </mesh>
      {/* lights */}
      {[-0.6, 0.6].map((x) => (
        <mesh
          key={x}
          position={[x, 0.78, 2.16]}
          material={materialFor("#fffbeb")}
        >
          <boxGeometry args={[0.32, 0.16, 0.02]} />
        </mesh>
      ))}
      <Wheel x={-0.92} z={1.35} />
      <Wheel x={0.92} z={1.35} />
      <Wheel x={-0.92} z={-1.35} />
      <Wheel x={0.92} z={-1.35} />
    </group>
  );
}

/** A bobbing marker + label floating over a spot (terminal, pick-up point…). */
export function FloatingMarker({
  label,
  height = 4.2,
  color = "#f2c200",
  scale = 1,
}) {
  const ref = useRef();
  const texture = useMemo(
    () =>
      textTexture(label, {
        width: 640,
        height: 128,
        background: "rgba(17, 24, 39, 0.88)",
        border: color,
        size: 54,
      }),
    [label, color],
  );
  useFrame(({ clock }) => {
    if (ref.current)
      ref.current.position.y =
        height + Math.sin(clock.elapsedTime * 2.2) * 0.25 * scale;
  });
  return (
    <group ref={ref} position={[0, height, 0]} scale={scale}>
      <mesh
        rotation={[Math.PI, 0, 0]}
        position={[0, -0.2, 0]}
        material={materialFor(color, { roughness: 0.3 })}
      >
        <coneGeometry args={[0.45, 0.9, 4]} />
      </mesh>
      <sprite position={[0, 1.05, 0]} scale={[4.6, 0.92, 1]}>
        <spriteMaterial
          map={texture}
          depthWrite={false}
          transparent
          toneMapped={false}
        />
      </sprite>
    </group>
  );
}

/** A cab rank: a few parked cabs, a shelter and the floating "terminal" marker. */
export default function CabTerminal({
  label = "Campus cab & shuttle terminal",
  cabs = 3,
}) {
  return (
    <group>
      {/* bay */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.02, 0]}
        material={materialFor("#3f3f46", { roughness: 0.95 })}
      >
        <planeGeometry args={[cabs * 2.8 + 2, 7]} />
      </mesh>
      {Array.from({ length: cabs }, (_, i) => (
        <group
          key={i}
          position={[(i - (cabs - 1) / 2) * 2.8, 0, 0.4]}
          rotation={[0, i % 2 ? 0.05 : -0.04, 0]}
        >
          <Cab />
        </group>
      ))}
      {/* shelter */}
      <mesh position={[0, 2.4, -3.2]} material={materialFor("#1f2937")}>
        <boxGeometry args={[cabs * 2.8, 0.15, 1.6]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          position={[s * (cabs * 1.4 - 0.2), 1.2, -3.2]}
          material={materialFor("#6b7280")}
        >
          <boxGeometry args={[0.12, 2.4, 0.12]} />
        </mesh>
      ))}
      <FloatingMarker label={label} height={4.6} />
    </group>
  );
}
