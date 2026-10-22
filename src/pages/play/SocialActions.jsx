import { useEffect, useState } from "react";
import { LuSmile } from "react-icons/lu";
import { EMOTES, greetPlayer, sendEmote } from "../../hooks/useRealtime";
import {
  targets,
  useRemotePlayers,
} from "../../game/multiplayer/useRemotePlayers";
import { toast } from "../../stores/useToastStore";
import styles from "./SocialActions.module.css";

const GREET_RANGE_M = 3.5; // the server allows 4 m
const CHECK_EVERY_MS = 300;

/**
 * Proximity interactions in the world: emotes everyone around you sees, and a
 * "wave at …" prompt when you stand next to another player.
 */
export default function SocialActions({ stateRef }) {
  const players = useRemotePlayers((s) => s.players);
  const [open, setOpen] = useState(false);
  const [nearest, setNearest] = useState(null);

  useEffect(() => {
    const timer = setInterval(() => {
      const me = stateRef.current;
      if (!me) return;
      let best = null;
      for (const [id, t] of targets) {
        const d = Math.hypot(t.x - me.x, t.z - me.z);
        if (d <= GREET_RANGE_M && (!best || d < best.d)) best = { id, d };
      }
      setNearest((prev) =>
        prev === (best?.id ?? null) ? prev : (best?.id ?? null),
      );
    }, CHECK_EVERY_MS);
    return () => clearInterval(timer);
  }, [stateRef]);

  async function emote(key) {
    const ack = await sendEmote(key);
    if (ack?.ok) setOpen(false);
    else
      toast({
        text: ack?.error?.message ?? "Emote not sent.",
        tone: "warning",
      });
  }

  async function greet() {
    const ack = await greetPlayer(nearest);
    toast(
      ack?.ok
        ? {
            text: `You waved at ${players[nearest]?.displayName ?? "them"} 👋`,
            ttl: 2500,
          }
        : {
            text: ack?.error?.message ?? "Couldn't greet them.",
            tone: "warning",
          },
    );
  }

  const person = nearest && players[nearest];
  return (
    <>
      {person && (
        <button type="button" className={styles.greet} onClick={greet}>
          👋 Wave at {person.displayName}
        </button>
      )}
      <div className={styles.emotes}>
        {open && (
          <div className={styles.tray} role="menu" aria-label="Emotes">
            {EMOTES.map((el) => (
              <button
                key={el.key}
                type="button"
                role="menuitem"
                className={styles.emote}
                onClick={() => emote(el.key)}
                aria-label={el.label}
                title={el.label}
              >
                <span aria-hidden="true">{el.icon}</span>
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={open}
          aria-label="Emotes"
          onClick={() => setOpen((v) => !v)}
        >
          <LuSmile aria-hidden="true" />
        </button>
      </div>
    </>
  );
}
