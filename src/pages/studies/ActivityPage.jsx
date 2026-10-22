import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { LuArrowLeft, LuClock } from "react-icons/lu";
import Button from "../../components/ui/Button";
import Notice from "../../components/ui/Notice";
import PageLoader from "../../components/ui/PageLoader";
import {
  useActivity,
  useStartAttempt,
  useSubmitAttempt,
} from "../../hooks/useLearningQueries";
import { getErrorMessage } from "../../lib/errorMessages";
import { toast } from "../../stores/useToastStore";
import { FORMATS } from "./formats/registry";
import ResultPanel from "./ResultPanel";
import { DIFFICULTY_LABELS, formatDue } from "./studiesLabels";
import styles from "./Studies.module.css";

// /studies/activities/:key — do one activity: start (or resume) an attempt, answer, submit.
export default function ActivityPage() {
  const { key } = useParams();
  const detail = useActivity(key);
  const start = useStartAttempt();
  const submit = useSubmitAttempt();
  const [session, setSession] = useState(null); // { attempt, view }
  const [answer, setAnswer] = useState(null);
  const [outcome, setOutcome] = useState(null);

  if (detail.isPending) return <PageLoader label="Opening the activity…" />;
  if (detail.error) {
    return (
      <div className={styles.page}>
        <Notice tone="danger">{getErrorMessage(detail.error)}</Notice>
        <Link to="/studies" className={styles.back}>
          <LuArrowLeft aria-hidden="true" /> Back to studies
        </Link>
      </div>
    );
  }

  const { activity, attempts } = detail.data;
  const format = FORMATS[activity.engine];

  function begin() {
    setOutcome(null);
    start.mutate(key, {
      onSuccess: (data) => {
        setSession(data);
        setAnswer(format.initial?.(data.view) ?? {});
      },
    });
  }

  function send() {
    submit.mutate(
      { attemptId: session.attempt.id, answer },
      {
        onSuccess: (data) => {
          setOutcome(data);
          setSession(null);
          if (data.result.xpAwarded > 0)
            toast({
              title: activity.title,
              text: `+${data.result.xpAwarded} game XP`,
              tone: "success",
            });
          data.achievementsEarned.forEach((a) =>
            toast({
              title: "Achievement unlocked",
              text: a.title,
              tone: "discovery",
            }),
          );
        },
      },
    );
  }

  const { state } = activity;
  return (
    <div className={styles.page}>
      <Link to="/studies?tab=activities" className={styles.back}>
        <LuArrowLeft aria-hidden="true" /> Back to activities
      </Link>

      <header className={styles.activityHead}>
        <p className={styles.eyebrow}>
          {activity.discipline} · {activity.format} ·{" "}
          {DIFFICULTY_LABELS[activity.difficulty]}
        </p>
        <h1 className={styles.title}>{activity.title}</h1>
        {activity.summary && <p className={styles.muted}>{activity.summary}</p>}
        <p className={styles.meta}>
          Up to {activity.xp} game XP · pass mark {activity.passPercent}% ·{" "}
          {state.attemptsUsed} of {activity.maxAttempts} attempts used
          {activity.timeLimitSeconds &&
            ` · ${Math.round(activity.timeLimitSeconds / 60)} min limit`}
          {activity.dueAt && ` · ${formatDue(activity.dueAt)}`}
        </p>
        {state.best && (
          <p className={styles.meta}>
            Your best at this level: {state.best.percent}%{" "}
            {state.best.passed ? "(passed)" : ""}
          </p>
        )}
      </header>

      {activity.notice && <p className={styles.notice}>{activity.notice}</p>}

      {outcome && (
        <ResultPanel
          engine={activity.engine}
          result={outcome.result}
          missions={outcome.missionsCompleted}
          achievements={outcome.achievementsEarned}
        />
      )}

      {session ? (
        <section className={styles.card}>
          {session.attempt.expiresAt && activity.timeLimitSeconds && (
            <Countdown until={session.attempt.expiresAt} />
          )}
          <format.View
            view={session.view}
            value={answer}
            onChange={setAnswer}
            disabled={submit.isPending}
          />
          {submit.error && (
            <Notice tone="danger">{getErrorMessage(submit.error)}</Notice>
          )}
          <div className={styles.actions}>
            <Button
              onClick={send}
              loading={submit.isPending}
              disabled={!format.ready(session.view, answer)}
            >
              Submit
            </Button>
          </div>
        </section>
      ) : (
        <section className={styles.card}>
          {state.available ? (
            <Button onClick={begin} loading={start.isPending}>
              {state.openAttemptId
                ? "Resume attempt"
                : outcome
                  ? "Try again"
                  : "Start"}
            </Button>
          ) : (
            <p className={styles.muted}>{state.reason}</p>
          )}
          {start.error && (
            <Notice tone="danger">{getErrorMessage(start.error)}</Notice>
          )}
        </section>
      )}

      {attempts.length > 0 && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Your attempts at this level</h2>
          <ul className={styles.list}>
            {attempts.map((a) => (
              <li key={a.id} className={styles.row}>
                <span>Attempt {a.number}</span>
                <span className={styles.muted}>
                  {a.status === "submitted"
                    ? `${a.percent}% · ${a.passed ? "passed" : "not passed"} · +${a.xpAwarded} XP`
                    : a.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Countdown({ until }) {
  const [left, setLeft] = useState(() =>
    Math.max(0, new Date(until) - Date.now()),
  );
  useEffect(() => {
    const timer = setInterval(
      () => setLeft(Math.max(0, new Date(until) - Date.now())),
      1000,
    );
    return () => clearInterval(timer);
  }, [until]);
  const minutes = Math.floor(left / 60000);
  const seconds = Math.floor((left % 60000) / 1000);
  return (
    <p className={left < 60000 ? styles.timerLow : styles.timer} role="timer">
      <LuClock aria-hidden="true" /> {minutes}:
      {String(seconds).padStart(2, "0")} left
    </p>
  );
}
