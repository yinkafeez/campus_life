import styles from "./Formats.module.css";

// value = { choices: { stepId: choiceId } } — steps unlock one at a time
export default function ScenarioView({ view, value, onChange, disabled }) {
  const choices = value?.choices ?? {};
  const reached = view.steps.findIndex((s) => !choices[s.id]);
  const visible =
    reached === -1 ? view.steps : view.steps.slice(0, reached + 1);

  return (
    <div className={styles.stack}>
      <p className={styles.intro}>{view.intro}</p>
      {visible.map((step, i) => (
        <fieldset key={step.id} className={styles.question} disabled={disabled}>
          <legend className={styles.prompt}>
            Step {i + 1}: {step.situation}
          </legend>
          <div className={styles.options}>
            {step.choices.map((c) => (
              <label
                key={c.id}
                className={
                  choices[step.id] === c.id ? styles.optionOn : styles.option
                }
              >
                <input
                  type="radio"
                  name={step.id}
                  value={c.id}
                  checked={choices[step.id] === c.id}
                  onChange={() =>
                    onChange({ choices: { ...choices, [step.id]: c.id } })
                  }
                />
                {c.text}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
