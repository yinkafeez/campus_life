import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { LuAward, LuCheck, LuCircle } from "react-icons/lu";
import Button from "../../components/ui/Button";
import Notice from "../../components/ui/Notice";
import PageLoader from "../../components/ui/PageLoader";
import SimulatedBanner from "../../components/SimulatedBanner";
import {
  useAchievements,
  useActivities,
  useAdvanceLevel,
  useMissions,
  useStanding,
} from "../../hooks/useLearningQueries";
import { getErrorMessage } from "../../lib/errorMessages";
import { toast } from "../../stores/useToastStore";
import { DIFFICULTY_LABELS, formatDue } from "./studiesLabels";
import styles from "./Studies.module.css";
import ErrorState from "../../components/ui/ErrorState";

const TABS = [
  ["overview", "Standing"],
  ["activities", "Activities"],
  ["missions", "Missions"],
  ["achievements", "Achievements"],
];

// /studies — game academics: my level and what it takes to move up, my activities,
// missions and achievements. Everything here is fictional game progress.
export default function StudiesPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([k]) => k === params.get("tab"))
    ? params.get("tab")
    : "overview";
  const standing = useStanding();

  if (standing.isPending) return <PageLoader label="Opening your studies…" />;
  if (standing.error) {
    const notEnrolled = ["NOT_ENROLLED", "NOT_MATRICULATED"].includes(
      standing.error.code,
    );
    return (
      <div className={styles.page}>
        <Notice tone={notEnrolled ? "info" : "danger"}>
          {getErrorMessage(standing.error)}{" "}
          {notEnrolled && <Link to="/admission">Continue your admission</Link>}
        </Notice>
      </div>
    );
  }
  const s = standing.data;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>
          {s.status === "graduated" ? "Graduated (game)" : s.level.label} ·{" "}
          {s.totalXp} game XP
        </p>
        <h1 className={styles.title}>Studies</h1>
      </header>

      <nav className={styles.tabs} role="tablist" aria-label="Studies">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? styles.tabOn : styles.tab}
            onClick={() => setParams({ tab: key })}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "overview" && <Overview standing={s} />}
      {tab === "activities" && <Activities />}
      {tab === "missions" && <Missions />}
      {tab === "achievements" && <Achievements />}

      <SimulatedBanner text={s.disclaimer} />
    </div>
  );
}

function Overview({ standing: s }) {
  const advance = useAdvanceLevel();
  if (s.status === "graduated") {
    return (
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>You've completed every level 🎓</h2>
        <p className={styles.muted}>
          Graduation here is a game milestone only — not a real degree.
        </p>
        <History history={s.history} />
      </section>
    );
  }
  return (
    <>
      <section className={styles.card}>
        <div className={styles.levelRow}>
          <div>
            <p className={styles.muted}>This level</p>
            <p className={styles.big}>{s.level.label}</p>
          </div>
          <div>
            <p className={styles.muted}>XP at this level</p>
            <p className={styles.big}>{s.levelXp}</p>
          </div>
          <div>
            <p className={styles.muted}>Activities passed</p>
            <p className={styles.big}>{s.passedAtLevel}</p>
          </div>
        </div>

        <h2 className={styles.cardTitle}>
          To move{" "}
          {s.isFinalLevel ? "to graduation" : `up to ${s.nextLevel?.label}`}
        </h2>
        <ul className={styles.list}>
          {s.requirements.map((r) => (
            <li key={r.key} className={styles.requirement}>
              {r.done ? (
                <LuCheck className={styles.good} aria-label="Done" />
              ) : (
                <LuCircle className={styles.pending} aria-label="Not yet" />
              )}
              <span>{r.label}</span>
              {r.need > 1 && (
                <span className={styles.meter} aria-hidden="true">
                  <span
                    style={{ width: `${Math.round((r.have / r.need) * 100)}%` }}
                  />
                </span>
              )}
              <span className={styles.muted}>
                {r.have}/{r.need}
              </span>
            </li>
          ))}
        </ul>
        <div className={styles.actions}>
          <Button
            disabled={!s.canAdvance}
            loading={advance.isPending}
            onClick={() =>
              advance.mutate(undefined, {
                onSuccess: ({ promotion }) =>
                  toast({
                    title: promotion.graduated
                      ? "Graduated (game)"
                      : "Level up!",
                    text: promotion.graduated
                      ? "You've completed your programme in the game."
                      : `Welcome to ${promotion.to.label}.`,
                    tone: "success",
                  }),
              })
            }
          >
            {s.isFinalLevel ? "Graduate" : `Move up to ${s.nextLevel?.label}`}
          </Button>
        </div>
        {advance.error && (
          <ErrorState error={advance.error} onRetry={advance.refetch} />
        )}
      </section>
      <History history={s.history} />
    </>
  );
}

function History({ history }) {
  if (history.length < 2) return null;
  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Your levels</h2>
      <ul className={styles.list}>
        {history.map((h) => (
          <li key={h.level} className={styles.row}>
            <span>{h.label}</span>
            <span className={styles.muted}>
              {h.xp} XP · {h.passed} passed{" "}
              {h.completedAt ? "· completed" : "· current"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Activities() {
  const activities = useActivities();
  const [filter, setFilter] = useState("todo");
  if (activities.isPending) return <p className={styles.muted}>Loading…</p>;
  if (activities.error)
    return <ErrorState error={activities.error} onRetry={activities.refetch} />;

  const list = activities.data.filter((a) =>
    filter === "todo"
      ? !a.state.best?.passed
      : filter === "passed"
        ? a.state.best?.passed
        : true,
  );
  const groups = Map.groupBy(list, (a) => a.discipline ?? "Other");

  return (
    <>
      <div className={styles.filters} role="group" aria-label="Show">
        {[
          ["todo", "To do"],
          ["passed", "Passed"],
          ["all", "All"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={filter === key ? styles.chipOn : styles.chip}
            onClick={() => setFilter(key)}
            aria-pressed={filter === key}
          >
            {label}
          </button>
        ))}
      </div>
      {list.length === 0 && (
        <p className={styles.muted}>Nothing here — try another filter.</p>
      )}
      {[...groups].map(([discipline, items]) => (
        <section key={discipline} className={styles.card}>
          <h2 className={styles.cardTitle}>{discipline}</h2>
          <ul className={styles.list}>
            {items.map((a) => (
              <li key={a.key}>
                <Link
                  to={`/studies/activities/${a.key}`}
                  className={styles.activityRow}
                >
                  <div className={styles.activityMain}>
                    <p className={styles.activityTitle}>{a.title}</p>
                    <p className={styles.muted}>
                      {a.format} · {DIFFICULTY_LABELS[a.difficulty]} · up to{" "}
                      {a.xp} XP
                      {a.dueAt && ` · ${formatDue(a.dueAt)}`}
                    </p>
                  </div>
                  <span
                    className={
                      a.state.best?.passed
                        ? styles.badgeGood
                        : a.state.available
                          ? styles.badge
                          : styles.badgeOff
                    }
                  >
                    {a.state.best?.passed
                      ? `${a.state.best.percent}%`
                      : a.state.openAttemptId
                        ? "In progress"
                        : a.state.available
                          ? "Start"
                          : "Closed"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function Missions() {
  const missions = useMissions();
  if (missions.isPending) return <p className={styles.muted}>Loading…</p>;
  if (missions.error)
    return <ErrorState error={missions.error} onRetry={missions.refetch} />;
  return missions.data.map((m) => (
    <section key={m.key} className={styles.card}>
      <div className={styles.missionHead}>
        <h2 className={styles.cardTitle}>{m.title}</h2>
        <span className={m.complete ? styles.badgeGood : styles.badge}>
          {m.complete ? "Complete" : `+${m.xp} XP`}
        </span>
      </div>
      {m.summary && <p className={styles.muted}>{m.summary}</p>}
      {m.requiredForPromotion && (
        <p className={styles.required}>
          Needed to move up{m.perLevel ? " (every level)" : ""}
        </p>
      )}
      <ul className={styles.list}>
        {m.steps.map((step) => (
          <li key={step.key} className={styles.requirement}>
            {step.done ? (
              <LuCheck className={styles.good} aria-label="Done" />
            ) : (
              <LuCircle className={styles.pending} aria-label="Not yet" />
            )}
            <span>{step.label}</span>
            {step.need > 1 && (
              <span className={styles.muted}>
                {step.have}/{step.need}
              </span>
            )}
          </li>
        ))}
      </ul>
      {m.steps.some((st) => !st.done && st.type.startsWith("discover")) && (
        <Link to="/play" className={styles.link}>
          Go to campus →
        </Link>
      )}
    </section>
  ));
}

function Achievements() {
  const achievements = useAchievements();
  if (achievements.isPending) return <p className={styles.muted}>Loading…</p>;
  if (achievements.error)
    return (
      <ErrorState error={achievements.error} onRetry={achievements.refetch} />
    );
  return (
    <section className={styles.badges}>
      {achievements.data.map((a) => (
        <article
          key={a.key}
          className={a.earned ? styles.achievement : styles.achievementLocked}
        >
          <LuAward className={styles.achievementIcon} aria-hidden="true" />
          <p className={styles.activityTitle}>{a.title}</p>
          <p className={styles.muted}>{a.description}</p>
          <p className={styles.muted}>{a.earned ? "Earned" : "Locked"}</p>
        </article>
      ))}
    </section>
  );
}
