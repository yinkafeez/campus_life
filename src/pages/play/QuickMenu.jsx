import { Link } from "react-router-dom";
import { LuGraduationCap, LuMap, LuMessageCircle } from "react-icons/lu";
import Sheet from "../../components/ui/Sheet";
import { destinationsFor } from "../../lib/destinations";
import styles from "./QuickMenu.module.css";

/**
 * The in-world "phone": in-world tools first (map, chat), then every other screen.
 * Opening it never pauses the world.
 */
export default function QuickMenu({ enrolled, onClose, onOpenPanel }) {
  const list = destinationsFor({ enrolled }).filter((d) => d.key !== "campus");
  return (
    <Sheet title="Phone" onClose={onClose}>
      <ul className={styles.grid}>
        <li>
          <button
            type="button"
            className={styles.tile}
            onClick={() => onOpenPanel("map")}
          >
            <LuMap aria-hidden="true" />
            <span>Map</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className={styles.tile}
            onClick={() => onOpenPanel("chat")}
          >
            <LuMessageCircle aria-hidden="true" />
            <span>Zone chat</span>
          </button>
        </li>
        {!enrolled && (
          <li>
            <Link to="/admission" className={styles.tile}>
              <LuGraduationCap aria-hidden="true" />
              <span>Admission</span>
            </Link>
          </li>
        )}
        {list.map((d) => (
          <li key={d.key}>
            <Link to={d.to} className={styles.tile}>
              <d.icon aria-hidden="true" />
              <span>{d.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
