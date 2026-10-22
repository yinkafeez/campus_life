import { LuInfo } from "react-icons/lu";
import styles from "./SimulatedBanner.module.css";

// Always-visible reminder that admission, matric numbers and records are game fiction.
export default function SimulatedBanner({ text }) {
  return (
    <p className={styles.banner}>
      <LuInfo className={styles.icon} aria-hidden="true" />
      <span>
        <strong>Game simulation.</strong>{" "}
        {text ??
          "Admissions, matric numbers and student records in Campus Life are fictional and have no connection to any real university's records."}
      </span>
    </p>
  );
}
