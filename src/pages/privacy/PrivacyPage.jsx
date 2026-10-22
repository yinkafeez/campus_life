import { Link } from "react-router-dom";
import Panel from "../../components/ui/Panel";
import styles from "./PrivacyPage.module.css";

/*
 * /privacy — the plain-language privacy notice and game rules (public, also before sign-up).
 * Keep in step with docs/SECURITY.md (data inventory and retention).
 */
export default function PrivacyPage() {
  return (
    <Panel className={styles.panel}>
      <h1 className={styles.heading}>Privacy & game rules</h1>
      <p className={styles.lead}>
        Campus Life is a <strong>game</strong>. Admission, matric numbers,
        grades, money, hostels and elections are simulated and fictional. They
        are not real university records and not real money. The game is for
        players aged 16 and over.
      </p>

      <h2 className={styles.sub}>What we keep, and why</h2>
      <ul className={styles.list}>
        <li>
          <strong>Your account:</strong> email (to sign in; never shown to other
          players), username, a scrambled (hashed) password, and the devices
          you’re signed in on.
        </li>
        <li>
          <strong>Your game:</strong> character, simulated student record,
          wallet of game coins, items, studies, games, hostel, elections you
          stood in, places you visited.
        </li>
        <li>
          <strong>Social:</strong> friends, blocks and mutes, messages you send,
          and reports you make. Zone chat isn’t stored; only the last moments
          are kept briefly in memory so reports can quote them.
        </li>
        <li>
          <strong>Votes are secret:</strong> we store that you voted, never who
          you voted for.
        </li>
        <li>
          Technical logs (no passwords or cookies) to keep the game running and
          safe. We don’t sell data or show ads.
        </li>
      </ul>

      <h2 className={styles.sub}>How long</h2>
      <ul className={styles.list}>
        <li>Sign-in sessions end after 30 days of no use.</li>
        <li>Your campus activity history: 90 days.</li>
        <li>
          Resolved reports and their evidence: 1 year, then deleted
          automatically.
        </li>
        <li>Everything else: until you delete your account.</li>
      </ul>

      <h2 className={styles.sub}>Your choices</h2>
      <ul className={styles.list}>
        <li>
          Privacy controls (who can message you, see you online, see your
          activity) live in{" "}
          <Link to="/social?tab=safety">Social → Safety & privacy</Link>.
        </li>
        <li>
          In <Link to="/settings">Settings</Link> you can change your password,
          <strong> download all your data</strong>, or{" "}
          <strong>delete your account</strong>.
        </li>
        <li>
          Report anyone who makes you uncomfortable. Moderators review reports
          and can warn, mute or suspend players.
        </li>
      </ul>

      <h2 className={styles.sub}>Be safe</h2>
      <p className={styles.text}>
        Other players are real people. Never share your phone number, address,
        bank details or passwords. Public chat hides phone numbers and emails
        automatically.
      </p>
      <p className={styles.fine}>
        Real places appear only as stylised, not-to-scale locations, with links
        to Google Maps. University names are used to describe a fictional game
        setting; the game is not affiliated with any university.
      </p>
    </Panel>
  );
}
