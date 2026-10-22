import { Link } from "react-router-dom";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import { GRAPHICS, useSettingsStore } from "../../stores/useSettingsStore";
import { toast } from "../../stores/useToastStore";
import AccountPanel from "./AccountPanel";
import styles from "./SettingsPage.module.css";

// /settings — this device's game preferences, plus shortcuts to account and privacy.
export default function SettingsPage() {
  const settings = useSettingsStore();

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Settings</h1>

      <Panel className={styles.panel}>
        <h2 className={styles.section}>Graphics</h2>
        <fieldset className={styles.options}>
          <legend className="sr-only">Graphics quality</legend>
          {Object.entries(GRAPHICS).map(([key, g]) => (
            <label
              key={key}
              className={
                settings.graphics === key ? styles.optionOn : styles.option
              }
            >
              <input
                type="radio"
                name="graphics"
                value={key}
                checked={settings.graphics === key}
                onChange={() => settings.set({ graphics: key })}
              />
              <span className={styles.optionLabel}>{g.label}</span>
              <span className={styles.hint}>{g.hint}</span>
            </label>
          ))}
        </fieldset>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={settings.nameTags}
            onChange={(e) => settings.set({ nameTags: e.target.checked })}
          />
          <span>
            Show other players’ names
            <span className={styles.hint}>
              Names always hide for far-away players.
            </span>
          </span>
        </label>
        <p className={styles.hint}>
          Press <kbd>P</kbd> on campus to see frames per second and other
          performance numbers.
        </p>
      </Panel>

      <Panel className={styles.panel}>
        <h2 className={styles.section}>Help</h2>
        <p className={styles.hint}>
          Show the orientation briefing (controls, objectives, safety) again the
          next time you enter campus.
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            settings.set({ briefingSeen: false });
            toast({ text: "Guides reset.", tone: "success" });
          }}
        >
          Show guides again
        </Button>
      </Panel>

      <AccountPanel />

      <Panel className={styles.panel}>
        <h2 className={styles.section}>Account & privacy</h2>
        <ul className={styles.links}>
          <li>
            <Link to="/profile">Player profile (display name, bio)</Link>
          </li>
          <li>
            <Link to="/social?tab=safety">
              Safety & privacy (who can message you, blocks, mutes)
            </Link>
          </li>
          <li>
            <Link to="/character">Wardrobe and appearance</Link>
          </li>
          <li>
            <Link to="/privacy">Privacy notice & game rules</Link>
          </li>
        </ul>
        <p className={styles.hint}>
          Campus Life is a game. Admission, grades, money and elections are
          simulated and fictional.
        </p>
      </Panel>
    </div>
  );
}
