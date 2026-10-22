import { useRef } from "react";
import CharacterModel from "../character/CharacterModel";
import NameTag from "./NameTag";

// Campus NPCs (fictional characters from the university's records), dressed with the
// same wardrobe system as players. They stand at their posts; talking happens in the HUD.
export default function Npcs({ npcs, catalogue }) {
  return npcs.map((npc) => (
    <Npc key={npc.key} npc={npc} catalogue={catalogue} />
  ));
}

function Npc({ npc, catalogue }) {
  const motion = useRef({ speed: 0 });
  return (
    <group position={[npc.x, 0, npc.z]} rotation={[0, npc.rotY ?? 0, 0]}>
      <CharacterModel
        appearance={npc.look.appearance}
        equipped={npc.look.equipped ?? {}}
        catalogue={catalogue}
        motionRef={motion}
      />
      <NameTag text={npc.name} tone="npc" />
    </group>
  );
}
