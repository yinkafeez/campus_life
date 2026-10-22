import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import ZoneScene from "./world/ZoneScene";
import LocationMarkers from "./world/LocationMarkers";
import Npcs from "./world/Npcs";
import RouteGuide from "./world/RouteGuide";
import RemotePlayers from "./multiplayer/RemotePlayers";
import PlayerController from "./player/PlayerController";
import PerfProbe from "./perf/PerfProbe";

// The playable 3D world: one zone, its places and NPCs, other players, and me.
// Lazy-loaded with the /play route. `layout` (colliders, trees) is built by the page.
export default function GameWorld({
  zone,
  layout,
  character,
  catalogue,
  stateRef,
  locations = [],
  npcs = [],
  destination = null,
  route = null,
  showPerf = false,
  graphics = "auto",
}) {
  // graphics setting: battery saver = 1x fixed; high = sharper; auto = adapts to the device
  const range = { saver: [1, 1], high: [1.25, 2], auto: [1, 1.5] }[
    graphics
  ] ?? [1, 1.5];
  const [dpr, setDpr] = useState(graphics === "saver" ? 1 : 1.25);

  return (
    <Canvas
      dpr={Math.min(range[1], Math.max(range[0], dpr))}
      camera={{ fov: 55, near: 0.1, far: 260, position: [0, 6, 20] }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      style={{ touchAction: "none" }}
    >
      {/* adapt resolution to the device: phones drop to 1x, strong GPUs go up to 1.5x */}
      <PerformanceMonitor
        onIncline={() => setDpr(range[1])}
        onDecline={() => setDpr(range[0])}
        flipflops={3}
        onFallback={() => setDpr(range[0])}
      />
      {showPerf && <PerfProbe />}
      <color attach="background" args={[zone.sky]} />
      <fog attach="fog" args={[zone.sky, 60, 160]} />
      <hemisphereLight args={["#ffffff", "#5a6b3f", 0.85]} />
      <directionalLight
        position={[30, 40, 20]}
        intensity={1.4}
        color="#fff3dc"
      />

      <ZoneScene zone={zone} layout={layout} />
      <LocationMarkers locations={locations} destination={destination} />
      <Npcs npcs={npcs} catalogue={catalogue} />
      <RouteGuide route={route} />
      <RemotePlayers catalogue={catalogue} />
      <PlayerController
        character={character}
        catalogue={catalogue}
        colliders={layout.colliders}
        stateRef={stateRef}
      />
    </Canvas>
  );
}
