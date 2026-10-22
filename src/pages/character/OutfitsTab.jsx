import { useSaveOutfit, useWearOutfit } from "../../hooks/useCharacterQueries";
import { getErrorMessage } from "../../lib/errorMessages";
import { OCCASION_LABELS } from "../../game/character/occasions";
import Button from "../../components/ui/Button";
import Notice from "../../components/ui/Notice";
import styles from "./OutfitsTab.module.css";

// Saved outfits for lectures, matriculation, parties, formal occasions and sports.
export default function OutfitsTab({
  character,
  catalogue,
  currentSlots,
  onWear,
}) {
  const wear = useWearOutfit();
  const save = useSaveOutfit();

  if (!character) {
    return (
      <Notice>
        Save your character first — then you can keep an outfit for every
        occasion.
      </Notice>
    );
  }

  const describe = (slots) =>
    Object.values(slots ?? {})
      .filter(Boolean)
      .map((el) => catalogue.itemsByKey.get(el.item)?.name ?? el.item)
      .join(" · ") || "Nothing saved yet";

  const error = wear.error ?? save.error;

  return (
    <div className={styles.stack}>
      <p className={styles.intro}>
        Wear a saved outfit, or keep your current look for an occasion.
      </p>
      {error && <Notice tone="danger">{getErrorMessage(error)}</Notice>}

      {catalogue.occasions.map((occasion) => {
        const outfit = character.outfits.find((el) => el.occasion === occasion);
        return (
          <article key={occasion} className={styles.card}>
            <div className={styles.text}>
              <h3 className={styles.name}>
                {OCCASION_LABELS[occasion] ?? occasion}
              </h3>
              <p className={styles.items}>{describe(outfit?.slots)}</p>
            </div>
            <div className={styles.buttons}>
              <Button
                size="sm"
                disabled={!outfit}
                loading={wear.isPending && wear.variables === occasion}
                onClick={() =>
                  wear.mutate(occasion, {
                    onSuccess: ({ character: updated }) => onWear(updated),
                  })
                }
              >
                Wear
              </Button>
              <Button
                size="sm"
                variant="ghost"
                loading={
                  save.isPending && save.variables?.occasion === occasion
                }
                onClick={() => save.mutate({ occasion, slots: currentSlots })}
              >
                Save current look
              </Button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
