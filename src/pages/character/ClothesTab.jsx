import { Link } from "react-router-dom";
import { LuLock } from "react-icons/lu";
import { OPTIONAL_SLOTS, setSlot } from "../../game/character/look";
import Swatches from "./Swatches";
import styles from "./ClothesTab.module.css";

const SLOT_LABELS = {
  top: "Top",
  bottom: "Bottom",
  fullbody: "Full outfit",
  shoes: "Shoes",
  headwear: "Headwear",
  eyewear: "Eyewear",
  accessory: "Accessory",
  overlay: "Over everything",
};

// Pick an item per slot (owned items only — the rest show a lock) and its colour.
export default function ClothesTab({ equipped, catalogue, onChange }) {
  const slots = Object.keys(SLOT_LABELS);

  return (
    <div className={styles.stack}>
      <p className={styles.note}>
        Tap an item to try it on. <LuLock aria-hidden="true" /> Locked items are
        sold in the <Link to="/money?tab=shop">Shop</Link> for Campus Coins.
      </p>
      {slots.map((slot) => {
        const items = catalogue.bySlot.get(slot) ?? [];
        if (!items.length) return null;
        const worn = equipped[slot];
        const wornItem = worn && catalogue.itemsByKey.get(worn.item);

        return (
          <section
            key={slot}
            className={styles.slot}
            aria-labelledby={`slot-${slot}`}
          >
            <h3 id={`slot-${slot}`} className={styles.slotTitle}>
              {SLOT_LABELS[slot]}
              {slot === "fullbody" && (
                <span className={styles.note}>replaces top and bottom</span>
              )}
            </h3>

            <div className={styles.items}>
              {OPTIONAL_SLOTS.includes(slot) && (
                <button
                  type="button"
                  className={!worn ? styles.itemOn : styles.item}
                  aria-pressed={!worn}
                  onClick={() => onChange(setSlot(equipped, slot, null))}
                >
                  None
                </button>
              )}
              {items.map((item) => {
                const owned =
                  catalogue.owned.size === 0
                    ? item.isStarter
                    : catalogue.owned.has(item.key);
                const on = worn?.item === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={on ? styles.itemOn : styles.item}
                    aria-pressed={on}
                    disabled={!owned}
                    title={
                      owned
                        ? (item.description ?? item.name)
                        : "Not in your wardrobe yet — buy it in the Shop"
                    }
                    onClick={() =>
                      onChange(
                        setSlot(equipped, slot, {
                          item: item.key,
                          color: item.colorable ? item.defaultColor : undefined,
                        }),
                      )
                    }
                  >
                    {!owned && (
                      <LuLock aria-hidden="true" className={styles.lock} />
                    )}
                    {item.name}
                  </button>
                );
              })}
            </div>

            {wornItem?.colorable && (
              <Swatches
                size="sm"
                options={catalogue.palettes.fabricColors}
                value={worn.color ?? wornItem.defaultColor}
                onChange={(color) =>
                  onChange(setSlot(equipped, slot, { item: worn.item, color }))
                }
              />
            )}
          </section>
        );
      })}
    </div>
  );
}
