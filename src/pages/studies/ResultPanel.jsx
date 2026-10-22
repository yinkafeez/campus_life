import { LuCheck, LuX } from "react-icons/lu";
import styles from "./Studies.module.css";

const mark = (ok) =>
  ok ? (
    <LuCheck className={styles.good} aria-label="Correct" />
  ) : (
    <LuX className={styles.bad} aria-label="Not quite" />
  );

// What the server said about a submission: score, XP and per-item feedback.
export default function ResultPanel({
  engine,
  result,
  missions = [],
  achievements = [],
  reward, // optional text that replaces the XP line (e.g. hustle pay)
}) {
  return (
    <section className={styles.result} aria-label="Result">
      <div className={styles.resultHead}>
        <p className={result.passed ? styles.passed : styles.failed}>
          {result.passed ? "Passed" : "Not passed yet"} · {result.percent}%
        </p>
        <p className={styles.muted}>
          {result.score} / {result.maxScore} · pass mark {result.passPercent}%
          {result.late && " · submitted after the due date"}
        </p>
        <p className={styles.xp}>
          {reward !== undefined
            ? reward
            : result.xpAwarded > 0
              ? `+${result.xpAwarded} game XP`
              : "No new XP — beat your best score to earn more"}
        </p>
      </div>

      <ul className={styles.feedback}>
        {result.feedback.map((f, i) => (
          <li key={f.id} className={styles.feedbackItem}>
            {mark(f.correct)}
            <div>
              {engine === "quiz" && (
                <>
                  <p>
                    Question {i + 1}:{" "}
                    {f.correct ? "correct" : `answer — ${f.answer}`}
                  </p>
                  {f.explanation && (
                    <p className={styles.muted}>{f.explanation}</p>
                  )}
                </>
              )}
              {engine === "ordering" && (
                <p>
                  {f.position}. {f.text}
                </p>
              )}
              {engine === "matching" && (
                <p>
                  {f.left} → {f.answer}
                </p>
              )}
              {engine === "scenario" && (
                <>
                  <p>
                    Step {i + 1}: {f.points}/{f.best} points
                  </p>
                  <p className={styles.muted}>{f.feedback}</p>
                </>
              )}
              {engine === "written" && (
                <p>
                  {f.label} {f.correct && f.points ? `(+${f.points})` : ""}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
      {result.explanation && (
        <p className={styles.explanation}>
          {engine === "written" && result.lengthOk ? "Example answer: " : ""}
          {result.explanation}
        </p>
      )}

      {missions.map((m) => (
        <p key={m.key} className={styles.unlock}>
          Mission complete: {m.title} (+{m.xp} XP)
        </p>
      ))}
      {achievements.map((a) => (
        <p key={a.key} className={styles.unlock}>
          Achievement unlocked: {a.title}
        </p>
      ))}
    </section>
  );
}
