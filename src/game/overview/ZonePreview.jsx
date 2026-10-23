import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import ZoneScene from "../world/ZoneScene";
import { buildZoneLayout } from "../world/layout";
import { FloatingMarker } from "../props/Cab";
import { useSettingsStore } from "../../stores/useSettingsStore";

/*
 * "Where you left off" — a returning player's last spot in the 3D world as the start-screen
 * background: the zone scenery, the camera just behind where they stood, gently swaying,
 * and a marker on the spot. Uses only the zone file, so it works before signing in.
 */
function ChaseCamera({ spot }) {
  const t = useRef(0);
  useFrame(({ camera }, delta) => {
    t.current += delta;
    const sway = Math.sin(t.current * 0.25) * 0.35;
    const heading = spot.rotY + sway;
    // behind the player = opposite to where they faced (rotY π faces −Z)
    const back = 9;
    camera.position.set(
      spot.x - Math.sin(heading) * back,
      5.5,
      spot.z - Math.cos(heading) * back,
    );
    camera.lookAt(
      spot.x + Math.sin(heading) * 10,
      2.2,
      spot.z + Math.cos(heading) * 10,
    );
  });
  return null;
}

export default function ZonePreview({ zone, spot }) {
  const saver = useSettingsStore((s) => s.graphics === "saver");
  const layout = useMemo(() => buildZoneLayout(zone), [zone]);
  const where = spot ?? zone.spawn;
  return (
    <Canvas
      dpr={saver ? 1 : [1, 1.5]}
      camera={{ fov: 55, near: 0.1, far: 260 }}
      gl={{ antialias: true }}
    >
      <color attach="background" args={[zone.sky]} />
      <fog attach="fog" args={[zone.sky, 60, 170]} />
      <hemisphereLight args={["#ffffff", "#5a6b3f", 0.85]} />
      <directionalLight
        position={[30, 40, 20]}
        intensity={1.4}
        color="#fff3dc"
      />
      <ZoneScene zone={zone} layout={layout} />
      <group position={[where.x, 0, where.z]}>
        <FloatingMarker
          label="You were here"
          height={2.6}
          color="#34d389"
          scale={0.7}
        />
      </group>
      <ChaseCamera spot={where} />
    </Canvas>
  );
}
