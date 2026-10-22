import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import CharacterModel from "./character/CharacterModel";
import { materialFor } from "./character/materials";

// Turntable preview for the character creator: drag to rotate, scroll to zoom.
export default function CharacterPreview({ appearance, equipped, catalogue }) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ fov: 32, position: [0, 1.3, 4.2] }}
      style={{ touchAction: "none" }}
    >
      <color attach="background" args={["#0f1c17"]} />
      <hemisphereLight args={["#ffffff", "#24352b", 0.9]} />
      <directionalLight position={[2, 4, 3]} intensity={1.5} color="#fff1dc" />
      <directionalLight
        position={[-3, 2, -2]}
        intensity={0.5}
        color="#9ad1ff"
      />

      <CharacterModel
        appearance={appearance}
        equipped={equipped}
        catalogue={catalogue}
      />
      {/* podium */}
      <mesh
        position={[0, -0.05, 0]}
        material={materialFor("#1d3329", { roughness: 0.6 })}
      >
        <cylinderGeometry args={[0.7, 0.75, 0.1, 40]} />
      </mesh>

      <OrbitControls
        target={[0, 1, 0]}
        enablePan={false}
        minDistance={2.2}
        maxDistance={6}
        minPolarAngle={0.6}
        maxPolarAngle={Math.PI / 2}
        autoRotate
        autoRotateSpeed={0.8}
      />
    </Canvas>
  );
}
