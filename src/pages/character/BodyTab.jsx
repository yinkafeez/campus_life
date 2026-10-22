import Swatches from "./Swatches";
import styles from "./BodyTab.module.css";

const BODY_LABELS = { slim: "Slim", average: "Average", sturdy: "Sturdy" };

// Body type, height, skin tone, hairstyle and hair colour.
export default function BodyTab({ appearance, catalogue, onChange }) {
  const set = (field, value) => onChange({ ...appearance, [field]: value });
  const hairStyles = catalogue.bySlot.get("hair") ?? [];

  return (
    <div className={styles.stack}>
      <fieldset className={styles.group}>
        <legend className={styles.legend}>Body type</legend>
        <div className={styles.chips}>
          {catalogue.bodyTypes.map((type) => (
            <button
              key={type}
              type="button"
              className={
                appearance.bodyType === type ? styles.chipOn : styles.chip
              }
              aria-pressed={appearance.bodyType === type}
              onClick={() => set("bodyType", type)}
            >
              {BODY_LABELS[type] ?? type}
            </button>
          ))}
        </div>
      </fieldset>

      <div className={styles.group}>
        <label className={styles.legend} htmlFor="height">
          Height{" "}
          <span className={styles.value}>
            {Math.round(appearance.height * 175)} cm
          </span>
        </label>
        <input
          id="height"
          type="range"
          className={styles.range}
          min={catalogue.heightRange.min}
          max={catalogue.heightRange.max}
          step={0.01}
          value={appearance.height}
          onChange={(e) => set("height", Number(e.target.value))}
        />
      </div>

      <Swatches
        label="Skin tone"
        options={catalogue.palettes.skinTones}
        value={appearance.skinTone}
        onChange={(key) => set("skinTone", key)}
      />

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Hairstyle</legend>
        <div className={styles.chips}>
          {hairStyles.map((item) => (
            <button
              key={item.key}
              type="button"
              className={
                appearance.hairStyle === item.key ? styles.chipOn : styles.chip
              }
              aria-pressed={appearance.hairStyle === item.key}
              disabled={
                catalogue.owned.size > 0 && !catalogue.owned.has(item.key)
              }
              onClick={() => set("hairStyle", item.key)}
            >
              {item.name}
            </button>
          ))}
        </div>
      </fieldset>

      <Swatches
        label="Hair colour"
        options={catalogue.palettes.hairColors}
        value={appearance.hairColor}
        onChange={(key) => set("hairColor", key)}
      />
    </div>
  );
}
