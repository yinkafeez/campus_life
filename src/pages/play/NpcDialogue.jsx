import { useState } from "react";
import { LuX } from "react-icons/lu";
import styles from "./NpcDialogue.module.css";

/**
 * Talking to a campus NPC. Dialogue is data from the university's records:
 * nodes { text, options: [{ label, next? , action? }] }, starting at "start".
 * action "directions" → pick a place and get guided there; "end" closes.
 */
export default function NpcDialogue({ npc, places, onGuide, onClose }) {
  const [nodeKey, setNodeKey] = useState("start");
  const [choosing, setChoosing] = useState(false);
  const node = npc.dialogue?.[nodeKey] ?? npc.dialogue?.start;

  function choose(option) {
    if (option.action === "end") return onClose();
    if (option.action === "directions") return setChoosing(true);
    if (option.next) setNodeKey(option.next);
  }

  return (
    <section className={styles.box} aria-label={`Talking to ${npc.name}`}>
      <header className={styles.head}>
        <div>
          <p className={styles.name}>{npc.name}</p>
          {npc.role && <p className={styles.role}>{npc.role}</p>}
        </div>
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label="End conversation"
        >
          <LuX aria-hidden="true" />
        </button>
      </header>

      {choosing ? (
        <>
          <p className={styles.text}>
            Where you wan go? I go show you the way.
          </p>
          <div className={styles.options}>
            {places.map((place) => (
              <button
                key={place.slug}
                type="button"
                className={styles.option}
                onClick={() => onGuide(place.slug)}
              >
                {place.name}
              </button>
            ))}
            <button
              type="button"
              className={styles.back}
              onClick={() => setChoosing(false)}
            >
              Never mind
            </button>
          </div>
        </>
      ) : (
        <>
          <p className={styles.text}>{node?.text}</p>
          <div className={styles.options}>
            {node?.options.map((option) => (
              <button
                key={option.label}
                type="button"
                className={styles.option}
                onClick={() => choose(option)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </>
      )}
      <p className={styles.fineprint}>Fictional character.</p>
    </section>
  );
}
