import styles from "./Swatches.module.css";

// A row of colour circles. options: [{ key, name, hex }] or plain hex strings.
export default function Swatches({
  label,
  options,
  value,
  onChange,
  size = "md",
}) {
  return (
    <fieldset className={styles.group}>
      {label && <legend className={styles.legend}>{label}</legend>}
      <div className={styles.row}>
        {options.map((option) => {
          const { key, name, hex } =
            typeof option === "string"
              ? { key: option, name: option, hex: option }
              : option;
          const on = value === key;
          return (
            <button
              key={key}
              type="button"
              className={`${styles.swatch} ${styles[size]} ${on ? styles.on : ""}`}
              style={{ "--swatch": hex }}
              aria-label={name}
              aria-pressed={on}
              title={name}
              onClick={() => onChange(key)}
            />
          );
        })}
      </div>
    </fieldset>
  );
}
