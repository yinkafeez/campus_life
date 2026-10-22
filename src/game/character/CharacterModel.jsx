import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { DoubleSide } from "three";
import { materialFor } from "./materials";
import { dressBody } from "./outfitParts";

// An ORIGINAL procedural character built from primitives (no third-party model → no licence
// questions; see docs/ASSETS.md). Metres; feet at y = 0; faces +Z.
// motionRef.current = { speed } drives the walk cycle (0 = idle).

const BODY_WIDTH = { slim: 0.9, average: 1, sturdy: 1.14 };

function Segment({ position, rotation, color, children, scale }) {
  return (
    <mesh
      position={position}
      rotation={rotation}
      scale={scale}
      material={materialFor(color)}
    >
      {children}
    </mesh>
  );
}

// ─── Hair ────────────────────────────────────────────────────────────────
function Hair({ style, color }) {
  const m = materialFor(color, { roughness: 0.95 });
  const cap = (
    <mesh material={m} position={[0, 0.015, -0.005]} scale={[1.06, 1.08, 1.08]}>
      <sphereGeometry
        args={[0.125, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55]}
      />
    </mesh>
  );
  switch (style) {
    case "hair-bald":
      return null;
    case "hair-afro":
      return (
        // set back and up from the head so it frames the face instead of covering it
        <mesh material={m} position={[0, 0.1, -0.07]}>
          <sphereGeometry args={[0.19, 16, 12]} />
        </mesh>
      );
    case "hair-bun":
      return (
        <group>
          {cap}
          <mesh material={m} position={[0, 0.17, -0.04]}>
            <sphereGeometry args={[0.07, 12, 10]} />
          </mesh>
        </group>
      );
    case "hair-braids":
    case "hair-locs": {
      const long = style === "hair-braids" ? 0.36 : 0.28;
      return (
        <group>
          {cap}
          {Array.from({ length: 9 }, (_, i) => {
            const a = Math.PI * (0.15 + (i / 8) * 0.7);
            return (
              <mesh
                key={i}
                material={m}
                position={[
                  Math.cos(a) * 0.12,
                  -long / 2 + 0.03,
                  -Math.sin(a) * 0.1 - 0.02,
                ]}
              >
                <cylinderGeometry args={[0.018, 0.016, long, 5]} />
              </mesh>
            );
          })}
        </group>
      );
    }
    case "hair-twists":
      return (
        <group>
          {cap}
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2;
            return (
              <mesh
                key={i}
                material={m}
                position={[Math.cos(a) * 0.1, 0.09, Math.sin(a) * 0.1 - 0.01]}
              >
                <sphereGeometry args={[0.04, 8, 6]} />
              </mesh>
            );
          })}
        </group>
      );
    case "hair-cornrows":
      return (
        <group>
          {cap}
          {[-0.06, -0.02, 0.02, 0.06].map((x) => (
            <mesh
              key={x}
              material={m}
              position={[x, 0.1, -0.02]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <torusGeometry args={[0.1, 0.012, 4, 12, Math.PI]} />
            </mesh>
          ))}
        </group>
      );
    default: // hair-low-cut
      return cap;
  }
}

// ─── Extras (pieces with their own shape) ───────────────────────────────
function Extra({ extra, color }) {
  const m = materialFor(color);
  switch (extra) {
    case "collar":
      return (
        <mesh material={m} position={[0, 1.45, 0.02]}>
          <torusGeometry args={[0.075, 0.02, 6, 14]} />
        </mesh>
      );
    case "hood":
      return (
        <mesh material={m} position={[0, 1.47, -0.1]} rotation={[0.4, 0, 0]}>
          <sphereGeometry
            args={[0.12, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]}
          />
        </mesh>
      );
    case "jersey-stripe":
      return (
        <mesh
          material={materialFor("#f4f1ea")}
          position={[0, 1.25, 0]}
          scale={[1.16, 1, 0.82]}
        >
          <cylinderGeometry args={[0.175, 0.175, 0.05, 16]} />
        </mesh>
      );
    case "ankara-pattern":
      return (
        <group>
          {[1.08, 1.2, 1.32].map((y) => (
            <mesh
              key={y}
              material={materialFor("#f5b70a")}
              position={[0, y, 0]}
              scale={[1.16, 1, 0.82]}
            >
              <cylinderGeometry args={[0.176, 0.176, 0.025, 16]} />
            </mesh>
          ))}
        </group>
      );
    case "cuffs":
      return (
        <group>
          {[-0.1, 0.1].map((x) => (
            <mesh
              key={x}
              material={materialFor("#1c1c1f")}
              position={[x, 0.16, 0]}
            >
              <cylinderGeometry args={[0.07, 0.07, 0.05, 10]} />
            </mesh>
          ))}
        </group>
      );
    case "skirt":
      return (
        <mesh material={m} position={[0, 0.72, 0]}>
          <cylinderGeometry args={[0.18, 0.28, 0.42, 18]} />
        </mesh>
      );
    case "gown":
    case "wrapper":
      return (
        <mesh material={m} position={[0, 0.5, 0]}>
          <cylinderGeometry
            args={[0.18, extra === "gown" ? 0.33 : 0.25, 0.92, 20]}
          />
        </mesh>
      );
    case "long-top":
      return (
        <mesh material={m} position={[0, 0.98, 0]} scale={[1, 1, 0.8]}>
          <cylinderGeometry args={[0.19, 0.21, 0.6, 16]} />
        </mesh>
      );
    case "agbada":
      return (
        <group>
          <mesh material={m} position={[0, 0.88, 0]} scale={[1.45, 1, 0.75]}>
            <cylinderGeometry args={[0.2, 0.3, 1.0, 18]} />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh
              key={side}
              material={m}
              position={[side * 0.3, 1.18, 0]}
              rotation={[0, 0, side * 0.35]}
            >
              <boxGeometry args={[0.22, 0.42, 0.24]} />
            </mesh>
          ))}
        </group>
      );
    case "sole-white":
      return (
        <group>
          {[-0.1, 0.1].map((x) => (
            <mesh
              key={x}
              material={materialFor("#e5e7eb")}
              position={[x, 0.012, 0.04]}
            >
              <boxGeometry args={[0.12, 0.025, 0.26]} />
            </mesh>
          ))}
        </group>
      );
    case "sandals":
      return (
        <group>
          {[-0.1, 0.1].map((x) => (
            <mesh key={x} material={m} position={[x, 0.01, 0.04]}>
              <boxGeometry args={[0.12, 0.02, 0.26]} />
            </mesh>
          ))}
        </group>
      );
    case "cap":
      return (
        <group position={[0, 1.66, 0]}>
          <mesh material={m}>
            <sphereGeometry
              args={[0.13, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]}
            />
          </mesh>
          <mesh material={m} position={[0, 0, 0.13]}>
            <boxGeometry args={[0.18, 0.015, 0.12]} />
          </mesh>
        </group>
      );
    case "headband":
      return (
        <mesh
          material={m}
          position={[0, 1.67, 0]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <torusGeometry args={[0.122, 0.018, 6, 18]} />
        </mesh>
      );
    case "gele":
      return (
        <group position={[0, 1.74, -0.02]}>
          <mesh material={m} scale={[1.3, 0.75, 1.1]}>
            <sphereGeometry args={[0.15, 14, 10]} />
          </mesh>
          <mesh
            material={m}
            position={[0.05, 0.1, -0.02]}
            rotation={[0.3, 0.6, 0.5]}
          >
            <torusGeometry args={[0.13, 0.035, 6, 16, Math.PI * 1.4]} />
          </mesh>
        </group>
      );
    case "fila":
      return (
        <mesh
          material={m}
          position={[0.02, 1.73, -0.01]}
          rotation={[0, 0, 0.18]}
        >
          <cylinderGeometry args={[0.11, 0.125, 0.12, 16]} />
        </mesh>
      );
    case "glasses":
    case "sunglasses": {
      const lens =
        extra === "sunglasses"
          ? materialFor("#111111", { roughness: 0.1, metalness: 0.5 })
          : m;
      return (
        <group position={[0, 1.63, 0.115]}>
          {[-0.045, 0.045].map((x) => (
            <mesh key={x} material={lens} position={[x, 0, 0]}>
              <boxGeometry args={[0.06, 0.035, 0.01]} />
            </mesh>
          ))}
          <mesh material={m}>
            <boxGeometry args={[0.03, 0.008, 0.01]} />
          </mesh>
        </group>
      );
    }
    case "backpack":
      return (
        <mesh material={m} position={[0, 1.2, -0.2]}>
          <boxGeometry args={[0.28, 0.34, 0.13]} />
        </mesh>
      );
    case "watch":
      return (
        <mesh
          material={m}
          position={[-0.27, 0.86, 0]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <torusGeometry args={[0.05, 0.012, 6, 12]} />
        </mesh>
      );
    case "academic-gown":
      return (
        <group>
          <mesh position={[0, 0.98, 0]}>
            {/* open at the front: 300° of a cylinder */}
            <cylinderGeometry
              args={[
                0.24,
                0.33,
                0.95,
                20,
                1,
                true,
                Math.PI * 0.18,
                Math.PI * 1.64,
              ]}
            />
            <meshStandardMaterial
              color={color}
              side={DoubleSide}
              roughness={0.9}
            />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh
              key={side}
              material={m}
              position={[side * 0.27, 1.2, 0]}
              rotation={[0, 0, side * 0.12]}
            >
              <cylinderGeometry args={[0.07, 0.11, 0.36, 10]} />
            </mesh>
          ))}
        </group>
      );
    default:
      return null;
  }
}

export default function CharacterModel({
  appearance,
  equipped,
  catalogue,
  motionRef,
}) {
  const skin =
    catalogue.palettes.skinTones.find((el) => el.key === appearance.skinTone)
      ?.hex ?? "#6b3f2a";
  const hairHex =
    catalogue.palettes.hairColors.find((el) => el.key === appearance.hairColor)
      ?.hex ?? "#151110";
  const hairItem = catalogue.itemsByKey.get(appearance.hairStyle);

  const { segments, extras } = useMemo(
    () => dressBody(equipped, catalogue.itemsByKey, { skin }),
    [equipped, catalogue.itemsByKey, skin],
  );

  const width = BODY_WIDTH[appearance.bodyType] ?? 1;
  const root = useRef();
  const legL = useRef();
  const legR = useRef();
  const armL = useRef();
  const armR = useRef();
  const phase = useRef(0);

  // procedural walk / idle cycle
  useFrame((_, delta) => {
    const speed = motionRef?.current?.speed ?? 0;
    const moving = speed > 0.1;
    phase.current += delta * (moving ? 2.2 + speed * 1.6 : 1.6);
    const swing = moving ? Math.min(0.9, 0.25 + speed * 0.13) : 0;
    const s = Math.sin(phase.current);
    legL.current.rotation.x = s * swing;
    legR.current.rotation.x = -s * swing;
    armL.current.rotation.x = -s * swing * 0.8;
    armR.current.rotation.x = s * swing * 0.8;
    // breathing when idle, a small bounce when walking
    root.current.position.y = moving
      ? Math.abs(Math.cos(phase.current)) * 0.03
      : Math.sin(phase.current) * 0.004;
  });

  return (
    <group scale={[width, appearance.height, width]}>
      <group ref={root}>
        {/* legs (pivot at the hip) */}
        {[-0.1, 0.1].map((x, i) => (
          <group key={x} ref={i === 0 ? legL : legR} position={[x, 0.92, 0]}>
            <Segment position={[0, -0.22, 0]} color={segments.upperLeg}>
              <capsuleGeometry args={[0.075, 0.3, 4, 10]} />
            </Segment>
            <Segment position={[0, -0.62, 0]} color={segments.lowerLeg}>
              <capsuleGeometry args={[0.064, 0.3, 4, 10]} />
            </Segment>
            <Segment position={[0, -0.88, 0.04]} color={segments.feet}>
              <boxGeometry args={[0.11, 0.07, 0.24]} />
            </Segment>
          </group>
        ))}

        {/* hips, torso, neck, head */}
        <Segment
          position={[0, 0.96, 0]}
          color={segments.hips}
          scale={[1.1, 1, 0.8]}
        >
          <capsuleGeometry args={[0.16, 0.06, 4, 12]} />
        </Segment>
        <Segment
          position={[0, 1.22, 0]}
          color={segments.torso}
          scale={[1.15, 1, 0.8]}
        >
          <capsuleGeometry args={[0.17, 0.28, 4, 14]} />
        </Segment>
        <Segment position={[0, 1.48, 0]} color={skin}>
          <cylinderGeometry args={[0.055, 0.06, 0.1, 10]} />
        </Segment>
        <group position={[0, 1.62, 0]}>
          <Segment position={[0, 0, 0]} color={skin} scale={[1, 1.1, 1]}>
            <sphereGeometry args={[0.12, 18, 14]} />
          </Segment>
          {/* eyes */}
          {[-0.04, 0.04].map((x) => (
            <mesh
              key={x}
              material={materialFor("#141414", { roughness: 0.3 })}
              position={[x, 0.015, 0.108]}
            >
              <sphereGeometry args={[0.014, 8, 6]} />
            </mesh>
          ))}
          <Hair
            style={hairItem?.meshKey ?? appearance.hairStyle}
            color={hairHex}
          />
        </group>

        {/* arms (pivot at the shoulder) */}
        {[-0.235, 0.235].map((x, i) => (
          <group key={x} ref={i === 0 ? armL : armR} position={[x, 1.4, 0]}>
            <Segment position={[0, -0.15, 0]} color={segments.upperArm}>
              <capsuleGeometry args={[0.055, 0.2, 4, 10]} />
            </Segment>
            <Segment position={[0, -0.42, 0]} color={segments.lowerArm}>
              <capsuleGeometry args={[0.048, 0.2, 4, 10]} />
            </Segment>
            <Segment position={[0, -0.6, 0]} color={skin}>
              <sphereGeometry args={[0.05, 10, 8]} />
            </Segment>
          </group>
        ))}

        {extras.map((el) => (
          <Extra
            key={`${el.slot}-${el.extra}`}
            extra={el.extra}
            color={el.color}
          />
        ))}
      </group>
    </group>
  );
}
