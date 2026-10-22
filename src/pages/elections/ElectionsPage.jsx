import { Link, useSearchParams } from "react-router-dom";
import Button from "../../components/ui/Button";
import Notice from "../../components/ui/Notice";
import PageLoader from "../../components/ui/PageLoader";
import StatusBadge from "../../components/ui/StatusBadge";
import {
  useAnnouncements,
  useElections,
  useLeaders,
  useMyOffices,
} from "../../hooks/useElectionQueries";
import { getErrorMessage } from "../../lib/errorMessages";
import { nextStep, PHASES, PRIVILEGES, SCOPES, when } from "./electionText";
import OfficeDesk from "./OfficeDesk";
import styles from "./Elections.module.css";
import ErrorState from "../../components/ui/ErrorState";

const TABS = [
  ["elections", "Elections"],
  ["leaders", "My leaders"],
  ["announcements", "Announcements"],
];
const ACTIVE = ["nominations", "campaign", "voting", "counting", "disputed"];

// /elections — student elections (fictional, in-game) and the leaders who represent you.
export default function ElectionsPage() {
  const [params, setParams] = useSearchParams();
  const offices = useMyOffices();
  const tabs = offices.data?.length ? [...TABS, ["office", "My office"]] : TABS;
  const tab = tabs.some(([k]) => k === params.get("tab"))
    ? params.get("tab")
    : "elections";

  return (
    <div className={styles.page}>
      <header>
        <h1 className={styles.title}>Student elections</h1>
        <p className={styles.muted}>
          Stand for office, campaign and vote for your department, faculty, hall
          and Students’ Union. Everything here is a simulated game election with
          fictional candidates — one ballot per student, counted by the server.
        </p>
      </header>
      <nav className={styles.tabs} role="tablist" aria-label="Elections">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? styles.tabOn : styles.tab}
            onClick={() => setParams({ tab: key }, { replace: true })}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === "elections" && <ElectionList />}
      {tab === "leaders" && <Leaders />}
      {tab === "announcements" && <Announcements />}
      {tab === "office" && <OfficeDesk offices={offices.data ?? []} />}
    </div>
  );
}

function ElectionList() {
  const elections = useElections();
  if (elections.isPending) return <PageLoader label="Loading elections…" />;
  if (elections.error)
    return (
      <Notice
        tone={elections.error.code === "NOT_ENROLLED" ? "info" : "danger"}
      >
        {getErrorMessage(elections.error)}{" "}
        {elections.error.code === "NOT_ENROLLED" ? (
          <Link to="/admission">Go to admission</Link>
        ) : (
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => elections.refetch()}
          >
            Try again
          </button>
        )}
      </Notice>
    );
  if (!elections.data.length)
    return (
      <Notice tone="info">
        No elections are running for you right now. When the university opens an
        election cycle, your department, faculty, hall and Students’ Union
        positions appear here.
      </Notice>
    );

  const active = elections.data.filter((e) => ACTIVE.includes(e.phase));
  const rest = elections.data.filter((e) => !ACTIVE.includes(e.phase));
  return (
    <>
      {active.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Happening now</h2>
          <div className={styles.grid}>
            {active.map((e) => (
              <ElectionCard key={e.id} election={e} />
            ))}
          </div>
        </section>
      )}
      {rest.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Upcoming and past</h2>
          <div className={styles.grid}>
            {rest.map((e) => (
              <ElectionCard key={e.id} election={e} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function ElectionCard({ election: e }) {
  const phase = PHASES[e.phase] ?? { label: e.phase, tone: "neutral" };
  const step = nextStep(e.schedule);
  return (
    <article className={styles.card}>
      <p className={styles.kicker}>
        {SCOPES[e.scope.type]}
        {e.scope.unitName ? ` · ${e.scope.unitName}` : ""}
      </p>
      <h3 className={styles.cardTitle}>{e.title}</h3>
      <StatusBadge tone={phase.tone}>{phase.label}</StatusBadge>
      <p className={styles.meta}>
        {e.candidates} candidate{e.candidates === 1 ? "" : "s"} · {e.seats} seat
        {e.seats === 1 ? "" : "s"}
        {step ? ` · ${step.label} ${when(step.at)}` : ""}
      </p>
      <p className={styles.meta}>
        {e.hasVoted && "✓ You voted. "}
        {e.myCandidacy === "nominated" && "You are a candidate. "}
      </p>
      <Button to={`/elections/${e.id}`} variant="secondary" size="sm">
        {e.phase === "voting" && !e.hasVoted ? "Vote" : "Open"}
      </Button>
    </article>
  );
}

function Leaders() {
  const leaders = useLeaders();
  if (leaders.isPending) return <PageLoader label="Loading leaders…" />;
  if (leaders.error)
    return <ErrorState error={leaders.error} onRetry={leaders.refetch} />;
  if (!leaders.data.length)
    return (
      <Notice tone="info">
        Nobody holds an office for you yet. Leaders appear here once an election
        is certified.
      </Notice>
    );
  return (
    <div className={styles.grid}>
      {leaders.data.map((l) => (
        <article key={l.id} className={styles.card}>
          <p className={styles.kicker}>
            {SCOPES[l.scope.type]}
            {l.scope.unitName ? ` · ${l.scope.unitName}` : ""}
          </p>
          <h3 className={styles.cardTitle}>{l.title}</h3>
          <p>{l.holder.displayName}</p>
          <p className={styles.meta}>In office until {when(l.endsAt)}</p>
          <ul className={styles.bullets}>
            {l.privileges.map((p) => (
              <li key={p}>{PRIVILEGES[p] ?? p}</li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}

function Announcements() {
  const list = useAnnouncements();
  if (list.isPending) return <PageLoader label="Loading announcements…" />;
  if (list.error)
    return <ErrorState error={list.error} onRetry={list.refetch} />;
  if (!list.data.length)
    return (
      <Notice tone="info">
        No announcements yet. Your elected leaders’ notices show up here.
      </Notice>
    );
  return (
    <ol className={styles.feed}>
      {list.data.map((a) => (
        <li key={a.id} className={styles.card}>
          <p className={styles.kicker}>
            {a.office} · {a.leader} · {when(a.at)}
          </p>
          <h3 className={styles.cardTitle}>{a.title}</h3>
          <p className={styles.body}>{a.body}</p>
        </li>
      ))}
    </ol>
  );
}
