import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import CharacterModel from "../character/CharacterModel";
import NameTag from "../world/NameTag";
import { turnTowards } from "../player/movement";
import { EMOTES } from "../../hooks/useRealtime";
import { emotes, targets, useRemotePlayers } from "./useRemotePlayers";
import { useSettingsStore } from "../../stores/useSettingsStore";

// level of detail by distance from the camera: full avatar + name close by, a cheap
// silhouette further away (the server only sends players within ~60 m anyway)
export const LOD_FAR_M = 32;
const NAME_HIDE_M = 24;
const EMOTE_MS = 2500;
const ICONS = Object.fromEntries(EMOTES.map((el) => [el.key, el.icon]));

// Everyone else in my zone, gliding towards their latest reported positions.
export default function RemotePlayers({ catalogue }) {
  const players = useRemotePlayers((s) => s.players);
  const nameTags = useSettingsStore((s) => s.nameTags);
  return Object.values(players).map((p) => (
    <RemoteAvatar
      key={p.playerId}
      player={p}
      catalogue={catalogue}
      nameTags={nameTags}
    />
  ));
}

function RemoteAvatar({ player, catalogue, nameTags }) {
  const body = useRef();
  const motion = useRef({ speed: 0 });
  const placed = useRef(false);
  // React state changes only when a band / emote changes — not every frame
  const [detail, setDetail] = useState("near");
  const [showName, setShowName] = useState(true);
  const [emote, setEmote] = useState(null);

  useFrame(({ camera }, rawDelta) => {
    const target = targets.get(player.playerId);
    if (!target || !body.current) return;
    const delta = Math.min(rawDelta, 0.1);
    const pos = body.current.position;
    if (!placed.current) {
      pos.set(target.x, 0, target.z);
      body.current.rotation.y = target.rotY;
      placed.current = true;
    }
    const dx = target.x - pos.x;
    const dz = target.z - pos.z;
    const dist = Math.hypot(dx, dz);
    // smooth catch-up; snap if far behind (lag spike, zone re-join)
    if (dist > 8) pos.set(target.x, 0, target.z);
    else {
      const k = 1 - Math.exp(-8 * delta);
      pos.x += dx * k;
      pos.z += dz * k;
    }
    body.current.rotation.y = turnTowards(
      body.current.rotation.y,
      target.rotY,
      10 * delta,
    );
    motion.current.speed =
      target.anim === "idle" && dist < 0.05
        ? 0
        : target.anim === "run"
          ? 4.6
          : 2.2;

    const fromCamera = camera.position.distanceTo(pos);
    // a little hysteresis so avatars don't flicker at the boundary
    const nextDetail =
      fromCamera > LOD_FAR_M + 2
        ? "far"
        : fromCamera < LOD_FAR_M - 2
          ? "near"
          : detail;
    if (nextDetail !== detail) setDetail(nextDetail);
    const nameVisible = fromCamera < NAME_HIDE_M;
    if (nameVisible !== showName) setShowName(nameVisible);
    const e = emotes.get(player.playerId);
    const active = e && performance.now() - e.at < EMOTE_MS ? e.emote : null;
    if (active !== emote) setEmote(active);
  });

  return (
    <group ref={body}>
      {player.look && detail === "near" ? (
        <CharacterModel
          appearance={player.look.appearance}
          equipped={player.look.equipped ?? {}}
          catalogue={catalogue}
          motionRef={motion}
        />
      ) : (
        <mesh position={[0, 0.9, 0]}>
          <capsuleGeometry args={[0.3, 1.1, 3, 6]} />
          <meshStandardMaterial
            color={player.look?.appearance?.skinTone ?? "#94a3b8"}
          />
        </mesh>
      )}
      {emote && <NameTag text={ICONS[emote] ?? "✨"} y={2.75} />}
      {nameTags && showName && <NameTag text={player.displayName} />}
    </group>
  );
}
