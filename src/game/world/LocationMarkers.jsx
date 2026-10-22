import { useRef } from "react";
import { useFrame } from "@react-three/fiber";

const COLORS = {
  discovered: "#34d389",
  undiscovered: "#f5b70a",
  destination: "#38bdf8",
};

// A floating diamond + ground ring over every location placed in this zone.
// Gold = not discovered yet, green = discovered, blue = where you're heading.
export default function LocationMarkers({ locations, destination }) {
  return locations.map((loc) => (
    <Marker
      key={loc.slug}
      location={loc}
      color={
        loc.slug === destination
          ? COLORS.destination
          : loc.discovered
            ? COLORS.discovered
            : COLORS.undiscovered
      }
    />
  ));
}

function Marker({ location, color }) {
  const gem = useRef();
  const { x, z, radius = 4 } = location.world;

  useFrame(({ clock }) => {
    const t = clock.elapsedTime + x * 0.3;
    gem.current.position.y = 3.2 + Math.sin(t * 1.6) * 0.18;
    gem.current.rotation.y = t * 0.8;
  });

  return (
    <group position={[x, 0, z]}>
      <mesh ref={gem}>
        <octahedronGeometry args={[0.45, 0]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.55}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry
          args={[
            Math.max(0.6, radius * 0.35),
            Math.max(0.75, radius * 0.35 + 0.18),
            40,
          ]}
        />
        <meshBasicMaterial color={color} transparent opacity={0.55} />
      </mesh>
    </group>
  );
}
