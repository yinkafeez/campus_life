import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Instance, Instances } from "@react-three/drei";

const SPACING = 1.6;

// The wayfinding trail: glowing dots along the route + a light beacon on the destination.
export default function RouteGuide({ route }) {
  const dots = useMemo(() => {
    if (!route || route.length < 2) return [];
    const out = [];
    for (let i = 1; i < route.length; i += 1) {
      const a = route[i - 1];
      const b = route[i];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      for (let d = i === 1 ? 1.5 : 0; d < len; d += SPACING) {
        out.push({
          x: a.x + ((b.x - a.x) * d) / len,
          z: a.z + ((b.z - a.z) * d) / len,
        });
      }
    }
    return out.slice(0, 400);
  }, [route]);
  const beacon = useRef();

  useFrame(({ clock }) => {
    if (beacon.current)
      beacon.current.material.opacity =
        0.35 + Math.sin(clock.elapsedTime * 3) * 0.12;
  });

  if (!route || route.length < 2) return null;
  const end = route[route.length - 1];

  return (
    <group>
      <Instances limit={Math.max(1, dots.length)}>
        <circleGeometry args={[0.16, 10]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.9} />
        {dots.map((d, i) => (
          <Instance
            key={i}
            position={[d.x, 0.05, d.z]}
            rotation={[-Math.PI / 2, 0, 0]}
          />
        ))}
      </Instances>
      <mesh ref={beacon} position={[end.x, 6, end.z]}>
        <cylinderGeometry args={[0.35, 0.35, 12, 16, 1, true]} />
        <meshBasicMaterial
          color="#38bdf8"
          transparent
          opacity={0.35}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
