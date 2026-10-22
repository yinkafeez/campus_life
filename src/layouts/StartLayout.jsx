import { Link, Outlet } from "react-router-dom";
import styles from "./StartLayout.module.css";

// Start screen: game title on the scene, sign-in / sign-up panel beside it.
export default function StartLayout() {
  return (
    <div className={styles.screen}>
      <header className={styles.title}>
        <p className={styles.eyebrow}>A Nigerian campus-life game</p>
        <h1 className={styles.logo}>
          Campus<span>Life</span>
        </h1>
        <p className={styles.tagline}>
          Get admitted. Find your hostel. Live the campus.
        </p>
      </header>

      <main className={styles.panelSlot}>
        <Outlet />
      </main>

      <footer className={styles.footer}>
        <span>Fan-made game · not affiliated with any university</span>
        <Link to="/status" className={styles.footerLink}>
          Server status
        </Link>
      </footer>
    </div>
  );
}
