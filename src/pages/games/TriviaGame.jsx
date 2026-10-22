import styles from "./Games.module.css";

// value = { answers: { questionId: optionId } }
export default function TriviaGame({ view, value, onChange, disabled }) {
  const answers = value?.answers ?? {};
  return (
    <div className={styles.stack}>
      {view.questions.map((q, i) => (
        <fieldset key={q.id} className={styles.question} disabled={disabled}>
          <legend className={styles.prompt}>
            <span className={styles.category}>{q.category}</span> {i + 1}.{" "}
            {q.prompt}
          </legend>
          <div className={styles.options}>
            {q.options.map((o) => (
              <label
                key={o.id}
                className={
                  answers[q.id] === o.id ? styles.optionOn : styles.option
                }
              >
                <input
                  type="radio"
                  name={q.id}
                  checked={answers[q.id] === o.id}
                  onChange={() =>
                    onChange({ answers: { ...answers, [q.id]: o.id } })
                  }
                />
                {o.text}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
