import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Instance, Instances, MapControls } from "@react-three/drei";
import { materialFor } from "../character/materials";
import { textTexture } from "../world/textTexture";
import { seeded } from "../world/layout";
import UnilagGate from "../props/UnilagGate";
import CabTerminal, { FloatingMarker } from "../props/Cab";
import { useSettingsStore } from "../../stores/useSettingsStore";

/*
 * THE CAMPUS FROM ABOVE — one stylised model of the whole university (data in
 * unilagOverview.js), two ways to look at it:
 *   mode="hero" → the start screen: the camera drifts around the Main Gate and the cab terminal
 *   mode="map"  → "your campus": a top view you can pan/zoom, a signpost on every location
 * Everything is procedural low-poly geometry (instanced trees and blocks) so it runs on phones.
 */
const STYLE = {
  administrative: { color: "#e7e1d3", roof: "#6b7280", w: 20, d: 16, h: 10 },
  auditorium: { color: "#cdb8a0", roof: "#7a4b3a", w: 24, d: 26, h: 12 },
  library: { color: "#b9c4c9", roof: "#3d5a66", w: 26, d: 24, h: 14 },
  food: { color: "#efe0bf", roof: "#2f6b4f", w: 12, d: 10, h: 5 },
  religious: { color: "#f3efe6", roof: "#9a3412", w: 16, d: 22, h: 11 },
  transport: { color: "#9ca3af", roof: "#1f2937", w: 16, d: 8, h: 3 },
  sports: { color: "#d1d5db", roof: "#1d4ed8", w: 40, d: 30, h: 6 },
  health: { color: "#f8fafc", roof: "#b91c1c", w: 18, d: 14, h: 8 },
  market: { color: "#fde68a", roof: "#92400e", w: 22, d: 14, h: 5 },
  bookshop: { color: "#ddd6fe", roof: "#4c1d95", w: 14, d: 12, h: 6 },
  landmark: { color: "#e5e7eb", roof: "#78716c", w: 12, d: 12, h: 7 },
  recreation: { color: "#d6d3d1", roof: "#57534e", w: 22, d: 18, h: 3 },
  other: { color: "#d1c4e9", roof: "#4c1d95", w: 12, d: 12, h: 6 },
};
const HALL = { color: "#ead2ac", roof: "#8a3b2b" };

function Road({ seg }) {
  const [x1, z1, x2, z2, w] = seg;
  const len = Math.hypot(x2 - x1, z2 - z1);
  return (
    <mesh
      position={[(x1 + x2) / 2, 0.06, (z1 + z2) / 2]}
      rotation={[-Math.PI / 2, 0, -Math.atan2(z2 - z1, x2 - x1)]}
      material={materialFor("#3b3f45", { roughness: 0.95 })}
    >
      <planeGeometry args={[len + w * 0.6, w]} />
    </mesh>
  );
}

function Block({ x, z, w, d, h, color, roof, rotY = 0 }) {
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <mesh
        position={[0, h / 2, 0]}
        material={materialFor(color, { roughness: 0.85 })}
      >
        <boxGeometry args={[w, h, d]} />
      </mesh>
      <mesh
        position={[0, h + 0.4, 0]}
        material={materialFor(roof, { roughness: 0.7 })}
      >
        <boxGeometry args={[w + 1.2, 0.8, d + 1.2]} />
      </mesh>
    </group>
  );
}

// a hall of residence: two long wings in an L, like the campus' 4-storey halls
function Hall({ x, z, highlight }) {
  const color = highlight ? "#fcd34d" : HALL.color;
  return (
    <group>
      <Block x={x} z={z} w={34} d={11} h={13} color={color} roof={HALL.roof} />
      <Block
        x={x + 11.5}
        z={z + 13}
        w={11}
        d={18}
        h={13}
        color={color}
        roof={HALL.roof}
      />
    </group>
  );
}

function Park({ x, z }) {
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[x, 0.04, z]}
      material={materialFor("#4d9a3c", { roughness: 1 })}
    >
      <circleGeometry args={[18, 20]} />
    </mesh>
  );
}

/** A signpost: a post with a name board that always faces you and stays readable at any zoom. */
function SignPost({ x, z, text, highlight, onPick }) {
  const texture = useMemo(
    () =>
      textTexture(text, {
        width: 512,
        height: 112,
        background: highlight ? "#a16207" : "#12352a",
        border: highlight ? "#fde68a" : "#f5b70a",
        size: 46,
      }),
    [text, highlight],
  );
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 9, 0]} material={materialFor("#374151")}>
        <cylinderGeometry args={[0.6, 0.6, 18, 6]} />
      </mesh>
      <sprite
        position={[0, 21, 0]}
        scale={[0.16, 0.035, 1]}
        onClick={onPick ? (e) => (e.stopPropagation(), onPick()) : undefined}
      >
        <spriteMaterial
          map={texture}
          sizeAttenuation={false}
          depthTest={false}
          transparent
          toneMapped={false}
        />
      </sprite>
    </group>
  );
}

function useScenery(data) {
  return useMemo(() => {
    const rand = seeded(data.trees.seed);
    const near = (x, z, pad) =>
      data.places.some((p) => Math.hypot(p.x - x, p.z - z) < pad) ||
      data.roads.some(([x1, z1, x2, z2, w]) => {
        // distance from point to segment
        const dx = x2 - x1;
        const dz = z2 - z1;
        const t = Math.max(
          0,
          Math.min(1, ((x - x1) * dx + (z - z1) * dz) / (dx * dx + dz * dz)),
        );
        return Math.hypot(x - (x1 + t * dx), z - (z1 + t * dz)) < w / 2 + 4;
      }) ||
      data.water.some(
        (wa) =>
          Math.abs(x - wa.x) < wa.width / 2 &&
          Math.abs(z - wa.z) < wa.depth / 2,
      );
    const W = data.size.width / 2;
    const D = data.size.depth / 2;
    const trees = [];
    for (
      let i = 0;
      trees.length < data.trees.count && i < data.trees.count * 12;
      i += 1
    ) {
      const x = -W + rand() * W * 2;
      const z = -D + rand() * D * 2;
      if (near(x, z, 22)) continue;
      trees.push({ x, z, s: 2.6 + rand() * 2.4 });
    }
    const fill = seeded(data.fillers.seed);
    const fillers = [];
    for (
      let i = 0;
      fillers.length < data.fillers.count && i < data.fillers.count * 30;
      i += 1
    ) {
      const x = -W + 30 + fill() * (W * 2 - 60);
      const z = -D + 30 + fill() * (D * 2 - 60);
      if (
        near(x, z, 30) ||
        fillers.some((f) => Math.hypot(f.x - x, f.z - z) < 26)
      )
        continue;
      fillers.push({
        x,
        z,
        w: 14 + fill() * 14,
        d: 10 + fill() * 12,
        h: 6 + fill() * 10,
        rotY: (fill() - 0.5) * 0.6,
      });
    }
    return { trees, fillers };
  }, [data]);
}

function HeroCamera({ gate }) {
  const angle = useRef(0.9);
  useFrame(({ camera }, delta) => {
    angle.current += delta * 0.05;
    const r = 70;
    camera.position.set(
      gate.x + Math.cos(angle.current) * r,
      42,
      gate.z + Math.sin(angle.current) * r,
    );
    camera.lookAt(gate.x + 12, 6, gate.z - 12);
  });
  return null;
}

function MapCamera({ focus }) {
  const camera = useThree((s) => s.camera);
  useMemo(() => {
    camera.position.set(focus.x, 430, focus.z + 170);
    camera.lookAt(focus.x, 0, focus.z);
  }, [camera, focus.x, focus.z]);
  return (
    <MapControls
      target={[focus.x, 0, focus.z]}
      minDistance={60}
      maxDistance={720}
      maxPolarAngle={Math.PI / 2.6}
      enableDamping
    />
  );
}

/** The scene graph (also used inside other canvases). */
export function CampusModel({
  data,
  mode,
  names,
  highlight,
  onPick,
  signs = true,
}) {
  const { trees, fillers } = useScenery(data);
  const gate = data.gate;
  const label = (p) => names?.get(p.slug) ?? p.label;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[data.size.width + 600, data.size.depth + 600]} />
        <meshStandardMaterial color={data.ground} roughness={1} />
      </mesh>
      {data.water.map((wa, i) => (
        <mesh
          key={i}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[wa.x, 0.03, wa.z]}
        >
          <planeGeometry args={[wa.width, wa.depth]} />
          <meshStandardMaterial
            color="#2c6f86"
            roughness={0.15}
            metalness={0.3}
          />
        </mesh>
      ))}
      {data.roads.map((seg, i) => (
        <Road key={i} seg={seg} />
      ))}

      <group position={[gate.x, 0, gate.z]} rotation={[0, gate.rotY, 0]}>
        <UnilagGate />
        {mode === "hero" && (
          <FloatingMarker
            label="UNILAG Main Gate"
            height={17}
            color="#34d389"
            scale={1.6}
          />
        )}
      </group>
      <group
        position={[data.cabTerminal.x, 0, data.cabTerminal.z]}
        rotation={[0, data.cabTerminal.rotY, 0]}
      >
        <CabTerminal label="Campus cab terminal" />
      </group>

      {data.places.map((p) => {
        if (p.kind === "hall")
          return (
            <Hall
              key={p.slug}
              x={p.x}
              z={p.z}
              highlight={p.slug === highlight}
            />
          );
        if (p.kind === "park") return <Park key={p.slug} x={p.x} z={p.z} />;
        if (p.kind === "marker") return null;
        const s = {
          ...STYLE[p.category ?? "other"],
          ...(p.w && { w: p.w }),
          ...(p.d && { d: p.d }),
          ...(p.h && { h: p.h }),
        };
        return (
          <Block
            key={p.slug}
            x={p.x}
            z={p.z}
            {...s}
            color={p.slug === highlight ? "#fcd34d" : s.color}
          />
        );
      })}
      {fillers.map((f, i) => (
        <Block key={`f${i}`} {...f} color="#ddd3bd" roof="#6b6b63" />
      ))}

      <Instances limit={trees.length}>
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#2f6b3a" roughness={0.9} flatShading />
        {trees.map((t, i) => (
          <Instance key={i} position={[t.x, t.s * 1.3, t.z]} scale={t.s} />
        ))}
      </Instances>

      {mode === "map" &&
        signs &&
        data.places.map((p) => (
          <SignPost
            key={`s-${p.slug}`}
            x={p.x}
            z={p.z}
            text={label(p)}
            highlight={p.slug === highlight}
            onPick={onPick ? () => onPick(p.slug) : undefined}
          />
        ))}
    </group>
  );
}

/** Full-screen canvas with the campus (hero background or interactive map). */
export default function CampusOverview({
  data,
  mode = "hero",
  names,
  highlight,
  onPick,
  focus,
}) {
  const saver = useSettingsStore((s) => s.graphics === "saver");
  const center = focus ?? (mode === "hero" ? data.gate : { x: 0, z: 0 });
  return (
    <Canvas
      dpr={saver ? 1 : [1, 1.5]}
      camera={{
        fov: 45,
        near: 1,
        far: 2400,
        position: [center.x, 300, center.z + 200],
      }}
      style={{ touchAction: "none" }}
      gl={{ antialias: true }}
    >
      <color attach="background" args={["#9fcbe6"]} />
      <fog attach="fog" args={["#9fcbe6", 600, 1500]} />
      <hemisphereLight args={["#ffffff", "#4b6b3a", 0.9]} />
      <directionalLight
        position={[200, 300, 120]}
        intensity={1.4}
        color="#fff3dc"
      />
      <CampusModel
        data={data}
        mode={mode}
        names={names}
        highlight={highlight}
        onPick={onPick}
      />
      {mode === "hero" ? (
        <HeroCamera gate={data.gate} />
      ) : (
        <MapCamera focus={center} />
      )}
    </Canvas>
  );
}
