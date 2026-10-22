import styles from "./Games.module.css";

const AIM = { left: "Left", centre: "Centre", right: "Right" };

// value = { kicks: [{ direction, height }] } — pick a spot in the goal for each kick
export default function PenaltyGame({ view, value, onChange, disabled }) {
  const kicks = value?.kicks ?? Array.from({ length: view.kicks }, () => null);
  const set = (i, shot) => {
    const next = [...kicks];
    next[i] = shot;
    onChange({ kicks: next });
  };

  return (
    <div className={styles.stack}>
      <p className={styles.muted}>
        Choose where to shoot for each of your {view.kicks} penalties. Low shots
        are on target but easier to save; high shots are hard to stop but can
        fly over the bar.
      </p>
      {kicks.map((kick, i) => (
        <fieldset key={i} className={styles.kick} disabled={disabled}>
          <legend className={styles.prompt}>Penalty {i + 1}</legend>
          <div
            className={styles.goal}
            role="group"
            aria-label={`Penalty ${i + 1} target`}
          >
            {view.heights
              .slice()
              .reverse()
              .map((height) =>
                view.directions.map((direction) => {
                  const on =
                    kick?.direction === direction && kick?.height === height;
                  return (
                    <button
                      key={`${height}-${direction}`}
                      type="button"
                      className={on ? styles.spotOn : styles.spot}
                      aria-pressed={on}
                      aria-label={`Penalty ${i + 1}: ${height} ${direction}`}
                      onClick={() => set(i, { direction, height })}
                    >
                      {on
                        ? "⚽"
                        : `${height === "high" ? "↑" : "↓"} ${AIM[direction]}`}
                    </button>
                  );
                }),
              )}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
