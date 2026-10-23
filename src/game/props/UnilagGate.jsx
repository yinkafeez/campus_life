import { useMemo } from "react";
import { Shape } from "three";
import { materialFor } from "../character/materials";
import { textTexture } from "../world/textTexture";

/*
 * UNILAG MAIN GATE — an original, stylised 3D model built from a reference photo the
 * player supplied (aerial view of the Akoka entrance) and the gate's well-known form:
 *   - a red/terracotta plinth on the planted median between the two carriageways
 *   - two tall cream "wings" that rise and point outward, with a round medallion between them
 *   - an overhead pedestrian bridge spanning both carriageways right behind the monument
 *   - gatehouses on either side
 * No map imagery or 3D data was copied, and the medallion is a GENERIC emblem (open book +
 * star), not the university crest (logos and crests are never reproduced, see docs/ASSETS.md).
 * Units are metres; the group's origin is the centre of the median at the gate. The road runs
 * along Z (−Z = into campus).
 */
const CREAM = "#e9d9a6";
const CREAM_SHADE = "#d4c28c";
const BRICK = "#a8402f";
const KERB = "#e5e7eb";
const CONCRETE = "#9ca3af";

// one wing: a tall blade that widens and tips outward at the top
function wingShape() {
  const s = new Shape();
  s.moveTo(-1.1, 0);
  s.lineTo(1.1, 0);
  s.lineTo(0.9, 7.5);
  s.lineTo(2.4, 12.5); // outward point
  s.lineTo(-0.6, 9.2);
  s.lineTo(-1.1, 6);
  s.closePath();
  return s;
}

function Wing({ side }) {
  const shape = useMemo(() => wingShape(), []);
  return (
    <group position={[side * 1.7, 3, 0]} scale={[side, 1, 1]}>
      <mesh
        material={materialFor(CREAM, { roughness: 0.7 })}
        position={[0, 0, -0.45]}
      >
        <extrudeGeometry args={[shape, { depth: 0.9, bevelEnabled: false }]} />
      </mesh>
      {/* a darker inner face gives the two blades depth from the air */}
      <mesh material={materialFor(CREAM_SHADE)} position={[-1.15, 3.2, 0]}>
        <boxGeometry args={[0.08, 6.4, 0.92]} />
      </mesh>
    </group>
  );
}

function Medallion() {
  // generic emblem: blue ring, white field, gold star — deliberately NOT the real crest
  return (
    <group position={[0, 9.4, 0]}>
      <mesh
        rotation={[Math.PI / 2, 0, 0]}
        material={materialFor("#1e3a8a", { roughness: 0.4 })}
      >
        <cylinderGeometry args={[1.25, 1.25, 0.35, 32]} />
      </mesh>
      {[0.2, -0.2].map((z) => (
        <group key={z} position={[0, 0, z]}>
          <mesh
            rotation={[Math.PI / 2, 0, 0]}
            material={materialFor("#f8fafc")}
          >
            <cylinderGeometry args={[0.95, 0.95, 0.04, 32]} />
          </mesh>
          <mesh
            position={[0, 0, z > 0 ? 0.03 : -0.03]}
            rotation={[Math.PI / 2, 0, Math.PI / 5]}
            material={materialFor("#d4a017", {
              metalness: 0.4,
              roughness: 0.4,
            })}
          >
            <cylinderGeometry args={[0.45, 0.45, 0.03, 5]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function NamePlate({ z, rotationY }) {
  const texture = useMemo(
    () =>
      textTexture("UNIVERSITY OF LAGOS", {
        width: 768,
        height: 96,
        background: null,
        border: null,
        color: "#fef3c7",
        size: 56,
      }),
    [],
  );
  return (
    <mesh position={[0, 1.9, z]} rotation={[0, rotationY, 0]}>
      <planeGeometry args={[6.2, 0.78]} />
      <meshBasicMaterial map={texture} transparent toneMapped={false} />
    </mesh>
  );
}

function FootBridge({ z, span }) {
  const deckY = 6.6;
  const steps = 12;
  return (
    <group position={[0, 0, z]}>
      {/* deck + railings */}
      <mesh
        position={[0, deckY, 0]}
        material={materialFor(CONCRETE, { roughness: 0.9 })}
      >
        <boxGeometry args={[span, 0.5, 3]} />
      </mesh>
      {[-1.45, 1.45].map((dz) => (
        <mesh
          key={dz}
          position={[0, deckY + 0.75, dz]}
          material={materialFor("#4b5563")}
        >
          <boxGeometry args={[span, 1, 0.08]} />
        </mesh>
      ))}
      {/* piers: both kerbs and the median */}
      {[-span / 2 + 1, -5.2, 5.2, span / 2 - 1].map((x) => (
        <mesh
          key={x}
          position={[x, deckY / 2, 0]}
          material={materialFor(CONCRETE)}
        >
          <boxGeometry args={[0.8, deckY, 0.8]} />
        </mesh>
      ))}
      {/* stairs down to each walkway */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * (span / 2 + 0.2), 0, 0]}>
          {Array.from({ length: steps }, (_, i) => (
            <mesh
              key={i}
              position={[
                side * (i * 0.45 + 0.3),
                deckY - (i + 1) * (deckY / steps) + 0.15,
                2.4,
              ]}
              material={materialFor(CONCRETE)}
            >
              <boxGeometry args={[0.5, 0.3, 1.6]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function Gatehouse({ x, z }) {
  return (
    <group position={[x, 0, z]}>
      <mesh
        position={[0, 2.2, 0]}
        material={materialFor("#e8c77a", { roughness: 0.85 })}
      >
        <boxGeometry args={[7, 4.4, 5]} />
      </mesh>
      <mesh
        position={[0, 4.9, 0]}
        rotation={[0, Math.PI / 4, 0]}
        material={materialFor("#8a3b2b")}
      >
        <coneGeometry args={[5.6, 1.6, 4]} />
      </mesh>
      {[-1.8, 0, 1.8].map((dx) => (
        <mesh
          key={dx}
          position={[dx, 2.6, 2.52]}
          material={materialFor("#2b3a45", { roughness: 0.3 })}
        >
          <boxGeometry args={[1, 1.1, 0.05]} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * The whole gate set-piece: median + monument + bridge + gatehouses.
 *   carriageway: lane width each side (m); the road itself is drawn by the zone/overview
 */
export default function UnilagGate({
  carriageway = 7.5,
  withGatehouses = true,
}) {
  const half = 2.6 + carriageway; // median half-width + one carriageway
  return (
    <group>
      {/* planted median island (kerb + grass) running past the gate */}
      <mesh position={[0, 0.12, -4]} material={materialFor(KERB)}>
        <boxGeometry args={[5.2, 0.24, 34]} />
      </mesh>
      <mesh
        position={[0, 0.25, -4]}
        material={materialFor("#4f8a3a", { roughness: 1 })}
      >
        <boxGeometry args={[4.6, 0.04, 33.4]} />
      </mesh>

      {/* monument */}
      <mesh
        position={[0, 1.5, 0]}
        material={materialFor(BRICK, { roughness: 0.9 })}
      >
        <boxGeometry args={[6.6, 3, 4.2]} />
      </mesh>
      <mesh position={[0, 3.08, 0]} material={materialFor("#7f2f22")}>
        <boxGeometry args={[7, 0.16, 4.6]} />
      </mesh>
      <NamePlate z={2.12} rotationY={0} />
      <NamePlate z={-2.12} rotationY={Math.PI} />
      <Wing side={-1} />
      <Wing side={1} />
      <Medallion />
      {/* the tie beam that holds the medallion between the wings */}
      <mesh position={[0, 9.4, 0]} material={materialFor(CREAM_SHADE)}>
        <boxGeometry args={[4.4, 0.35, 0.5]} />
      </mesh>

      <FootBridge z={-7.5} span={half * 2 + 6} />
      {withGatehouses && (
        <>
          <Gatehouse x={-(half + 8)} z={2} />
          <Gatehouse x={half + 8} z={2} />
        </>
      )}
    </group>
  );
}
