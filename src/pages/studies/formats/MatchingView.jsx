import styles from "./Formats.module.css";

// value = { matches: { leftId: rightToken } }
export default function MatchingView({ view, value, onChange, disabled }) {
  const matches = value?.matches ?? {};
  const used = new Set(Object.values(matches));

  return (
    <div className={styles.stack}>
      <p className={styles.instructions}>{view.instructions}</p>
      <div className={styles.matchGrid}>
        <span className={styles.matchHead}>{view.leftLabel}</span>
        <span className={styles.matchHead}>{view.rightLabel}</span>
        {view.left.map((left) => (
          <div key={left.id} className={styles.matchRow}>
            <span className={styles.matchLeft}>{left.text}</span>
            <select
              className={styles.select}
              value={matches[left.id] ?? ""}
              disabled={disabled}
              aria-label={`Match for ${left.text}`}
              onChange={(e) =>
                onChange({ matches: { ...matches, [left.id]: e.target.value } })
              }
            >
              <option value="">Choose…</option>
              {view.right.map((right) => (
                <option
                  key={right.id}
                  value={right.id}
                  disabled={used.has(right.id) && matches[left.id] !== right.id}
                >
                  {right.text}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
