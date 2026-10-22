import styles from "./Formats.module.css";

// value = { answers: { questionId: optionId } }
export default function QuizView({ view, value, onChange, disabled }) {
  const answers = value?.answers ?? {};
  return (
    <div className={styles.stack}>
      {view.instructions && (
        <p className={styles.instructions}>{view.instructions}</p>
      )}
      {view.questions.map((q, i) => (
        <fieldset key={q.id} className={styles.question} disabled={disabled}>
          <legend className={styles.prompt}>
            {i + 1}. {q.prompt}
          </legend>
          {q.snippet && <pre className={styles.code}>{q.snippet}</pre>}
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
                  value={o.id}
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
