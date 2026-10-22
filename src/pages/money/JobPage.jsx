import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { LuArrowLeft, LuMapPin } from "react-icons/lu";
import Button from "../../components/ui/Button";
import Notice from "../../components/ui/Notice";
import PageLoader from "../../components/ui/PageLoader";
import {
  useAbandonJob,
  useCompleteJob,
  useJob,
} from "../../hooks/useEconomyQueries";
import { getErrorMessage } from "../../lib/errorMessages";
import { toast } from "../../stores/useToastStore";
import { FORMATS } from "../studies/formats/registry";
import ResultPanel from "../studies/ResultPanel";
import styles from "./Money.module.css";

// /money/jobs/:id — do a hustle job. Tasks reuse the studies formats; deliveries are walked
// in the 3D campus (the server checks you visited pickup, then drop-off, after accepting).
export default function JobPage() {
  const { id } = useParams();
  const job = useJob(id);
  const complete = useCompleteJob();
  const abandon = useAbandonJob();
  const [answer, setAnswer] = useState(null);
  const [outcome, setOutcome] = useState(null);

  if (job.isPending) return <PageLoader label="Opening the job…" />;
  if (job.error)
    return (
      <div className={styles.page}>
        <Notice tone="danger">{getErrorMessage(job.error)}</Notice>
      </div>
    );

  const { job: j, task, result } = job.data;
  const active = j.status === "active" && !outcome?.done;
  const format = task.type === "engine" ? FORMATS[task.engine] : null;
  const value = answer ?? format?.initial?.(task.view) ?? {};

  function submit() {
    complete.mutate(
      { id, answer: task.type === "engine" ? value : undefined },
      {
        onSuccess: (data) => {
          setOutcome(data);
          if (data.pay)
            toast({ title: "Paid", text: `+${data.pay} CC`, tone: "success" });
        },
      },
    );
  }

  const shown = outcome?.result ?? result;
  return (
    <div className={styles.page}>
      <Link to="/money?tab=hustles" className={styles.back}>
        <LuArrowLeft aria-hidden="true" /> Back to hustles
      </Link>
      <header className={styles.jobHead}>
        <p className={styles.eyebrow}>{j.hustleName}</p>
        <h1 className={styles.title}>{j.client}</h1>
        <p className={styles.muted}>{j.brief}</p>
        <p className={styles.meta}>
          Pays up to {j.basePay} CC · pass mark {j.passPercent}% · {j.status}
        </p>
      </header>

      {shown && (
        <ResultPanel
          engine={task.type === "engine" ? task.engine : "written"}
          result={{
            ...shown,
            passPercent: j.passPercent,
            maxScore: shown.maxScore ?? shown.max,
          }}
          reward={
            (outcome?.pay ?? job.data.pay)
              ? `+${outcome?.pay ?? job.data.pay} CC earned`
              : shown.passed === false && (outcome?.done ?? true)
                ? "The client wasn't happy — no pay this time."
                : "Not finished yet"
          }
        />
      )}

      {active && task.type === "route" && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Delivery route</h2>
          <ol className={styles.route}>
            <li>
              <LuMapPin aria-hidden="true" /> Pick up at{" "}
              <strong>{task.pickup.name}</strong>
            </li>
            <li>
              <LuMapPin aria-hidden="true" /> Deliver to{" "}
              <strong>{task.dropoff.name}</strong>
            </li>
          </ol>
          <p className={styles.muted}>
            Walk to each place on campus (in that order), then come back and
            confirm.
          </p>
          <div className={styles.inline}>
            <Button to="/play" size="sm" variant="secondary">
              Go to campus
            </Button>
            <Button size="sm" onClick={submit} loading={complete.isPending}>
              Confirm delivery
            </Button>
          </div>
          {outcome && !outcome.done && (
            <p className={styles.warn}>
              Not delivered yet — visit both places after taking the job.
            </p>
          )}
        </section>
      )}

      {active && format && (
        <section className={styles.card}>
          <format.View
            view={task.view}
            value={value}
            onChange={setAnswer}
            disabled={complete.isPending}
          />
          <div className={styles.inline}>
            <Button
              onClick={submit}
              loading={complete.isPending}
              disabled={!format.ready(task.view, value)}
            >
              Hand in the work
            </Button>
          </div>
        </section>
      )}
      {complete.error && (
        <Notice tone="danger">{getErrorMessage(complete.error)}</Notice>
      )}

      {active && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => abandon.mutate(id)}
          loading={abandon.isPending}
        >
          Give up this job
        </Button>
      )}
    </div>
  );
}
