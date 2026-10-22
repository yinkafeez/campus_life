import { LuExternalLink, LuX } from "react-icons/lu";
import { useDoActivity } from "../../hooks/useCampusQueries";
import { getErrorMessage } from "../../lib/errorMessages";
import { toast } from "../../stores/useToastStore";
import { CATEGORY_LABELS } from "../../game/world/categories";
import styles from "./LocationPanel.module.css";

// The card for the place you're standing at: what it is, what you can do, a real-world map link.
export default function LocationPanel({ location, onClose }) {
  const activity = useDoActivity();
  const verified = location.verification?.status === "verified";

  function run(a) {
    activity.mutate(
      { locationSlug: location.slug, activityKey: a.key },
      {
        onSuccess: ({ message }) =>
          toast({ title: a.label, text: message, tone: "success" }),
      },
    );
  }

  return (
    <section className={styles.panel} aria-label={location.name}>
      <header className={styles.head}>
        <div>
          <p className={styles.category}>
            {CATEGORY_LABELS[location.category] ?? location.category}
          </p>
          <h2 className={styles.name}>{location.name}</h2>
          {location.aliases?.length > 0 && (
            <p className={styles.aliases}>
              Also called: {location.aliases.join(", ")}
            </p>
          )}
        </div>
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label="Close"
        >
          <LuX aria-hidden="true" />
        </button>
      </header>

      {location.description && (
        <p className={styles.description}>{location.description}</p>
      )}
      {!verified && (
        <p className={styles.unverified}>
          Some details about this place are not confirmed yet
          {location.verification?.notes
            ? ` — ${location.verification.notes}`
            : "."}
        </p>
      )}

      {location.activities.length > 0 && (
        <div className={styles.activities}>
          {location.activities.map((a) => (
            <button
              key={a.key}
              type="button"
              className={styles.activity}
              onClick={() => run(a)}
              disabled={activity.isPending}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
      {activity.error && (
        <p className={styles.error}>{getErrorMessage(activity.error)}</p>
      )}

      <a
        className={styles.mapLink}
        href={location.externalMapUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        <LuExternalLink aria-hidden="true" /> See the real place on Google Maps
      </a>
      <p className={styles.fineprint}>
        The game campus is simplified and not to scale.
      </p>
    </section>
  );
}
