import { Instance, Instances } from "@react-three/drei";
import Sign from "./Sign";
import { PROPS } from "../props";

// Draws any zone from its data. Repeated things (trees, lamps, benches, windows) are instanced,
// so the whole zone costs a handful of draw calls regardless of how many props it has.
export default function ZoneScene({ zone, layout }) {
  const { bounds } = zone;
  const width = bounds.maxX - bounds.minX + 40;
  const depth = bounds.maxZ - bounds.minZ + 40;

  return (
    <group>
      {/* ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color={zone.ground} roughness={1} />
      </mesh>

      {/* roads: asphalt, kerbs and dashed centre lines */}
      {(zone.roads ?? []).map((r, i) => (
        <group key={`road-${i}`} position={[r.x, 0, r.z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
            <planeGeometry args={[r.width, r.depth]} />
            <meshStandardMaterial color="#3b3f45" roughness={0.95} />
          </mesh>
          {Array.from(
            { length: Math.floor(Math.max(r.width, r.depth) / 6) },
            (_, k) => {
              const along = -Math.max(r.width, r.depth) / 2 + 3 + k * 6;
              const vertical = r.depth >= r.width;
              return (
                <mesh
                  key={k}
                  rotation={[-Math.PI / 2, 0, vertical ? 0 : Math.PI / 2]}
                  position={vertical ? [0, 0.02, along] : [along, 0.02, 0]}
                >
                  <planeGeometry args={[0.18, 2.6]} />
                  <meshBasicMaterial color="#f5f5f4" />
                </mesh>
              );
            },
          )}
        </group>
      ))}

      {/* set-piece props (the university gate, a cab rank…) */}
      {(zone.props ?? []).map((p, i) => {
        const def = PROPS[p.type];
        if (!def) return null;
        return (
          <group
            key={`prop-${i}`}
            position={[p.x, 0, p.z]}
            rotation={[0, p.rotY ?? 0, 0]}
          >
            <def.Component {...(p.options ?? {})} />
          </group>
        );
      })}

      {/* walkways */}
      {zone.paths.map((p, i) => (
        <mesh
          key={i}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[p.x, 0.01 + i * 0.001, p.z]}
        >
          <planeGeometry args={[p.width, p.depth]} />
          <meshStandardMaterial color="#cdb894" roughness={0.95} />
        </mesh>
      ))}

      {/* lagoon beyond the railing */}
      {zone.water && (
        <>
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, -0.05, zone.water.z - zone.water.depth / 2]}
          >
            <planeGeometry args={[width, zone.water.depth]} />
            <meshStandardMaterial
              color="#2c6f86"
              roughness={0.15}
              metalness={0.3}
            />
          </mesh>
          <mesh position={[0, 0.5, zone.water.z]}>
            <boxGeometry args={[width - 30, 1, 0.15]} />
            <meshStandardMaterial color="#4b5563" />
          </mesh>
        </>
      )}

      {/* buildings: body + roof slab + a band of windows */}
      {zone.buildings.map((b) => (
        <group key={b.key} position={[b.x, 0, b.z]}>
          <mesh position={[0, b.height / 2, 0]}>
            <boxGeometry args={[b.width, b.height, b.depth]} />
            <meshStandardMaterial color={b.color} roughness={0.85} />
          </mesh>
          <mesh position={[0, b.height + 0.2, 0]}>
            <boxGeometry args={[b.width + 0.6, 0.4, b.depth + 0.6]} />
            <meshStandardMaterial color={b.roof} roughness={0.7} />
          </mesh>
          {Array.from({ length: Math.floor(b.height / 3.2) }, (_, floor) => (
            <mesh key={floor} position={[0, 1.8 + floor * 3.2, 0]}>
              <boxGeometry args={[b.width + 0.05, 0.9, b.depth + 0.05]} />
              <meshStandardMaterial
                color="#2b3a45"
                roughness={0.3}
                metalness={0.2}
              />
            </mesh>
          ))}
        </group>
      ))}

      {/* name boards */}
      {(zone.signs ?? []).map((s) => (
        <Sign
          key={s.text}
          text={s.text}
          position={[s.x, 0, s.z]}
          rotationY={s.rotY}
        />
      ))}

      {/* fountain in the middle of the quad */}
      {zone.fountain && (
        <group position={[zone.fountain.x, 0, zone.fountain.z]}>
          <mesh position={[0, 0.35, 0]}>
            <cylinderGeometry
              args={[zone.fountain.radius, zone.fountain.radius + 0.2, 0.7, 24]}
            />
            <meshStandardMaterial color="#9ca3af" />
          </mesh>
          <mesh position={[0, 0.66, 0]}>
            <cylinderGeometry
              args={[
                zone.fountain.radius - 0.25,
                zone.fountain.radius - 0.25,
                0.05,
                24,
              ]}
            />
            <meshStandardMaterial
              color="#3a86a8"
              roughness={0.1}
              metalness={0.3}
            />
          </mesh>
          <mesh position={[0, 1.2, 0]}>
            <cylinderGeometry args={[0.2, 0.3, 1.2, 12]} />
            <meshStandardMaterial color="#9ca3af" />
          </mesh>
        </group>
      )}

      {/* trees: trunks + crowns, two draw calls for all */}
      <Instances limit={layout.trees.length}>
        <cylinderGeometry args={[0.18, 0.26, 1.8, 6]} />
        <meshStandardMaterial color="#5b3d26" />
        {layout.trees.map((t, i) => (
          <Instance
            key={i}
            position={[t.x, 0.9 * t.scale, t.z]}
            scale={t.scale}
          />
        ))}
      </Instances>
      <Instances limit={layout.trees.length}>
        <icosahedronGeometry args={[1.4, 0]} />
        <meshStandardMaterial color="#2f6b3a" roughness={0.9} flatShading />
        {layout.trees.map((t, i) => (
          <Instance
            key={i}
            position={[t.x, 2.6 * t.scale, t.z]}
            scale={t.scale}
          />
        ))}
      </Instances>

      {/* lamp posts */}
      <Instances limit={zone.lamps.length}>
        <cylinderGeometry args={[0.06, 0.08, 3.2, 6]} />
        <meshStandardMaterial color="#374151" />
        {zone.lamps.map((l, i) => (
          <Instance key={i} position={[l.x, 1.6, l.z]} />
        ))}
      </Instances>
      <Instances limit={zone.lamps.length}>
        <sphereGeometry args={[0.2, 10, 8]} />
        <meshStandardMaterial
          color="#fff4c2"
          emissive="#ffd970"
          emissiveIntensity={0.6}
        />
        {zone.lamps.map((l, i) => (
          <Instance key={i} position={[l.x, 3.25, l.z]} />
        ))}
      </Instances>

      {/* benches */}
      <Instances limit={zone.benches.length}>
        <boxGeometry args={[1.8, 0.1, 0.5]} />
        <meshStandardMaterial color="#8b5e34" />
        {zone.benches.map((b, i) => (
          <Instance
            key={i}
            position={[b.x, 0.45, b.z]}
            rotation={[0, b.rotY, 0]}
          />
        ))}
      </Instances>
    </group>
  );
}
