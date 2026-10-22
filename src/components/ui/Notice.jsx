import styles from "./Notice.module.css";

// Inline message box. tone: info | success | danger | warning
export default function Notice({ tone = "info", children }) {
  return (
    <div
      className={`${styles.notice} ${styles[tone]}`}
      role={tone === "danger" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
