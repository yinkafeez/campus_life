import { useNavigate } from "react-router-dom";
import Button from "../../components/ui/Button";
import {
  useAcceptJob,
  useHustles,
  useRecentJobs,
} from "../../hooks/useEconomyQueries";
import styles from "./Money.module.css";
import ErrorState from "../../components/ui/ErrorState";

export default function HustlesTab() {
  const hustles = useHustles();
  const recent = useRecentJobs();
  const accept = useAcceptJob();
  const navigate = useNavigate();
  if (hustles.isPending) return <p className={styles.muted}>Loading…</p>;
  if (hustles.error)
    return <ErrorState error={hustles.error} onRetry={hustles.refetch} />;

  const start = (key) =>
    accept.mutate(key, {
      onSuccess: ({ job }) => navigate(`/money/jobs/${job.id}`),
    });

  return (
    <>
      {accept.error && (
        <ErrorState error={accept.error} onRetry={accept.refetch} />
      )}
      <ul className={styles.hustles}>
        {hustles.data.map((h) => (
          <li key={h.key} className={styles.hustle}>
            <div className={styles.hustleHead}>
              <h2 className={styles.cardTitle}>{h.name}</h2>
              <span className={styles.price}>up to {h.basePay} CC</span>
            </div>
            <p className={styles.muted}>{h.description}</p>
            <p className={styles.meta}>
              {h.energyCost} energy · rest {h.cooldownMinutes} min ·{" "}
              {h.jobsToday}/{h.maxJobsPerDay} today
              {h.requires.length > 0 && ` · needs ${h.requires.join(", ")}`}
              {h.consumes.length > 0 &&
                ` · uses ${h.consumes.map((c) => c.itemKey).join(", ")}`}
            </p>
            {h.blockers.length > 0 && !h.activeJobId && (
              <ul className={styles.blockers}>
                {h.blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            )}
            {h.activeJobId ? (
              <Button
                size="sm"
                onClick={() => navigate(`/money/jobs/${h.activeJobId}`)}
              >
                Continue job
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={!h.canAccept}
                loading={accept.isPending && accept.variables === h.key}
                onClick={() => start(h.key)}
              >
                Take a job
              </Button>
            )}
          </li>
        ))}
      </ul>
      {recent.data?.length > 0 && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Recent jobs</h2>
          <ul className={styles.list}>
            {recent.data.map((j) => (
              <li key={j.id} className={styles.row}>
                <span className={styles.rowMain}>{j.hustle}</span>
                <span className={styles.muted}>{j.status}</span>
                <span className={j.pay ? styles.amountIn : styles.muted}>
                  +{j.pay}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
