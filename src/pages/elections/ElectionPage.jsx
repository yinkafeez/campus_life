import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { LuArrowLeft } from "react-icons/lu";
import Button from "../../components/ui/Button";
import Notice from "../../components/ui/Notice";
import PageLoader from "../../components/ui/PageLoader";
import StatusBadge from "../../components/ui/StatusBadge";
import {
  useCastBallot,
  useElection,
  useFileDispute,
  useSupport,
  useVerifyBallot,
} from "../../hooks/useElectionQueries";
import { getErrorMessage } from "../../lib/errorMessages";
import { toast } from "../../stores/useToastStore";
import { PHASES, SCHEDULE, SCOPES, TIE_BREAKS, when } from "./electionText";
import { CampaignDesk, NominationForm } from "./CandidateForms";
import styles from "./Elections.module.css";

const CAMPAIGNING = ["nominations", "campaign", "voting"];

// /elections/:id — one election: rules, candidates, campaign, ballot, results, disputes.
export default function ElectionPage() {
  const { id } = useParams();
  const query = useElection(id);

  if (query.isPending) return <PageLoader label="Loading the election…" />;
  if (query.error)
    return (
      <div className={styles.page}>
        <Notice tone="danger">
          {getErrorMessage(query.error)}{" "}
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => query.refetch()}
          >
            Try again
          </button>
        </Notice>
        <Link to="/elections">Back to elections</Link>
      </div>
    );

  const { election, candidates, campaign, me, results } = query.data;
  const phase = PHASES[election.phase] ?? {
    label: election.phase,
    tone: "neutral",
  };
  const names = new Map(candidates.map((c) => [String(c.id), c.displayName]));
  const standing = candidates.filter((c) => c.status === "nominated");

  return (
    <div className={styles.page}>
      <Link to="/elections" className={styles.back}>
        <LuArrowLeft aria-hidden="true" /> All elections
      </Link>
      <header className={styles.section}>
        <p className={styles.kicker}>
          {SCOPES[election.scope.type]}
          {election.scope.unitName ? ` · ${election.scope.unitName}` : ""}
        </p>
        <h1 className={styles.title}>{election.title}</h1>
        <StatusBadge tone={phase.tone}>{phase.label}</StatusBadge>
        {election.body && <p className={styles.muted}>{election.body}</p>}
        <p className={styles.fine}>
          Simulated game election. Candidates are players; nothing here
          represents a real union, office or person.
        </p>
      </header>

      {election.cancellation && (
        <Notice tone="warning">
          This election was cancelled: {election.cancellation.reason}
        </Notice>
      )}

      <Timeline schedule={election.schedule} phase={election.phase} />
      <Eligibility me={me} election={election} />

      {election.phase === "nominations" && me.canStand && !me.candidacy && (
        <NominationForm electionId={election.id} />
      )}
      {me.candidacy?.status === "nominated" &&
        CAMPAIGNING.slice(0, 2).includes(election.phase) && (
          <CampaignDesk
            electionId={election.id}
            rules={election.rules.campaign ?? {}}
            mine={candidates.find(
              (c) => String(c.id) === String(me.candidacy.id),
            )}
          />
        )}

      {election.phase === "voting" && me.canVote && !me.hasVoted && (
        <Ballot election={election} candidates={standing} />
      )}
      {me.hasVoted && <VerifyBallot electionId={election.id} names={names} />}

      {results && (
        <Results
          results={results}
          election={election}
          seedHash={election.lotSeedHash}
        />
      )}

      <section className={styles.section} aria-labelledby="candidates">
        <h2 id="candidates" className={styles.sectionTitle}>
          Candidates
        </h2>
        {candidates.length === 0 ? (
          <Notice tone="info">
            No candidates yet.
            {election.phase === "nominations" && " Nominations are open."}
          </Notice>
        ) : (
          <>
            <p className={styles.fine}>
              Buzz (endorsements, volunteers, campaign activity) is just for fun
              — only votes decide the result.
            </p>
            <div className={styles.grid}>
              {candidates.map((c) => (
                <CandidateCard
                  key={c.id}
                  candidate={c}
                  election={election}
                  me={me}
                />
              ))}
            </div>
          </>
        )}
      </section>

      {campaign.length > 0 && (
        <CampaignFeed
          items={campaign}
          names={names}
          questions={election.rules.campaign?.debateQuestions ?? []}
        />
      )}

      {["counting", "disputed"].includes(election.phase) &&
        (me.hasVoted || me.candidacy) && <Dispute electionId={election.id} />}
    </div>
  );
}

// how many schedule steps are behind us in each phase
const STEPS_DONE = {
  scheduled: 0,
  nominations: 1,
  campaign: 2,
  voting: 3,
  counting: 4,
  disputed: 4,
  certified: 5,
  void: 5,
  cancelled: 0,
};

function Timeline({ schedule, phase }) {
  const done = STEPS_DONE[phase] ?? 0;
  return (
    <section className={styles.section} aria-label="Schedule">
      <ol className={styles.timeline}>
        {SCHEDULE.map(([key, label], i) => (
          <li key={key} className={i < done ? styles.stepDone : styles.step}>
            <span className={styles.stepLabel}>{label}</span>
            <span className={styles.meta}>{when(schedule[key])}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Eligibility({ me, election }) {
  return (
    <section className={styles.card} aria-labelledby="eligibility">
      <h2 id="eligibility" className={styles.cardTitle}>
        You and this election
      </h2>
      <p>
        {me.canVote
          ? me.hasVoted
            ? "✓ You have voted."
            : "✓ You can vote in this election."
          : "You can't vote in this election:"}
      </p>
      {!me.canVote && <Reasons list={me.voteReasons} />}
      {election.phase === "nominations" && (
        <>
          <p>
            {me.candidacy
              ? "You are a candidate."
              : me.canStand
                ? "✓ You can stand for this position."
                : "You can't stand for this position:"}
          </p>
          {!me.canStand && !me.candidacy && <Reasons list={me.standReasons} />}
        </>
      )}
      {me.gameStanding != null && (
        <p className={styles.meta}>
          Your game standing (from your Studies results): {me.gameStanding}
        </p>
      )}
      <p className={styles.meta}>
        Each voter chooses up to {election.votesPerVoter} candidate
        {election.votesPerVoter === 1 ? "" : "s"} for {election.seats} seat
        {election.seats === 1 ? "" : "s"}. Ties are settled by{" "}
        {TIE_BREAKS[election.rules.tieBreak] ?? election.rules.tieBreak}.
      </p>
    </section>
  );
}

const Reasons = ({ list = [] }) => (
  <ul className={styles.bullets}>
    {list.map((r) => (
      <li key={r}>{r}</li>
    ))}
  </ul>
);

function CandidateCard({ candidate: c, election, me }) {
  const support = useSupport();
  const mine = String(c.id) === String(me.candidacy?.id);
  const has = (kind) =>
    me.support.find(
      (s) => s.kind === kind && String(s.candidacy) === String(c.id),
    );
  const canSupport =
    !mine &&
    me.canVote &&
    c.status === "nominated" &&
    CAMPAIGNING.includes(election.phase);

  function toggle(kind) {
    support.mutate(
      { id: election.id, candidacyId: c.id, kind, remove: Boolean(has(kind)) },
      {
        onError: (err) =>
          toast({ text: getErrorMessage(err), tone: "warning" }),
      },
    );
  }

  return (
    <article
      className={styles.candidate}
      style={{ "--poster": c.poster?.color ?? "#1f7a4d" }}
    >
      <div className={styles[`poster_${c.poster?.layout ?? "bold"}`]}>
        <p className={styles.posterName}>{c.displayName}</p>
        {c.slogan && <p className={styles.posterSlogan}>“{c.slogan}”</p>}
      </div>
      {c.status !== "nominated" && (
        <StatusBadge tone="danger">
          {c.status === "disqualified" ? "Disqualified" : c.status}
        </StatusBadge>
      )}
      {c.statusReason && <p className={styles.meta}>{c.statusReason}</p>}
      {c.manifesto?.summary && <p>{c.manifesto.summary}</p>}
      {c.manifesto?.points?.length > 0 && (
        <ul className={styles.bullets}>
          {c.manifesto.points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <p className={styles.meta}>
        {c.buzz.endorsements} endorsements · {c.buzz.volunteers} volunteers ·{" "}
        {c.buzz.activities} campaign posts
      </p>
      {c.username && (
        <Link to={`/players/${c.username}`} className={styles.meta}>
          View profile
        </Link>
      )}
      {canSupport && (
        <div className={styles.inline}>
          {[
            ["endorse", "Endorse", "Endorsed ✓"],
            ["volunteer", "Volunteer", "Volunteering ✓"],
          ].map(([kind, label, on]) => (
            <Button
              key={kind}
              size="sm"
              variant={has(kind) ? "primary" : "secondary"}
              aria-pressed={Boolean(has(kind))}
              loading={support.isPending && support.variables?.kind === kind}
              onClick={() => toggle(kind)}
            >
              {has(kind) ? on : label}
            </Button>
          ))}
        </div>
      )}
    </article>
  );
}

function Ballot({ election, candidates }) {
  const cast = useCastBallot();
  const [chosen, setChosen] = useState([]);
  const [confirming, setConfirming] = useState(false);
  const max = election.votesPerVoter;

  function pick(id) {
    setConfirming(false);
    setChosen((list) =>
      list.includes(id)
        ? list.filter((x) => x !== id)
        : max === 1
          ? [id]
          : list.length < max
            ? [...list, id]
            : list,
    );
  }

  if (cast.data)
    return (
      <section className={styles.result} aria-live="polite">
        <h2 className={styles.cardTitle}>Your vote is in ✓</h2>
        <p>
          Your private ballot code (keep it — it’s the only way to check your
          ballot was counted, and it never reveals who you are):
        </p>
        <code className={styles.code}>{cast.data.ballotCode}</code>
      </section>
    );

  return (
    <section className={styles.card} aria-labelledby="ballot">
      <h2 id="ballot" className={styles.cardTitle}>
        Your ballot
      </h2>
      <p className={styles.meta}>
        Choose {max === 1 ? "one candidate" : `up to ${max} candidates`}. You
        can only vote once, and your choice is secret.
      </p>
      <fieldset className={styles.choices}>
        <legend className="sr-only">Candidates</legend>
        {candidates.map((c) => (
          <label key={c.id} className={styles.choice}>
            <input
              type={max === 1 ? "radio" : "checkbox"}
              name="ballot"
              checked={chosen.includes(c.id)}
              onChange={() => pick(c.id)}
            />
            <span>{c.displayName}</span>
            {c.slogan && <span className={styles.meta}>“{c.slogan}”</span>}
          </label>
        ))}
      </fieldset>
      {cast.error && (
        <Notice tone="danger">{getErrorMessage(cast.error)}</Notice>
      )}
      {confirming ? (
        <div className={styles.inline}>
          <span>
            Vote for{" "}
            {candidates
              .filter((c) => chosen.includes(c.id))
              .map((c) => c.displayName)
              .join(", ")}
            ? This can’t be changed.
          </span>
          <Button
            loading={cast.isPending}
            onClick={() =>
              cast.mutate({ id: election.id, candidacyIds: chosen })
            }
          >
            Cast my vote
          </Button>
          <Button variant="ghost" onClick={() => setConfirming(false)}>
            Back
          </Button>
        </div>
      ) : (
        <Button disabled={!chosen.length} onClick={() => setConfirming(true)}>
          Review my vote
        </Button>
      )}
    </section>
  );
}

function VerifyBallot({ electionId, names }) {
  const verify = useVerifyBallot();
  const [code, setCode] = useState("");
  return (
    <details className={styles.card}>
      <summary className={styles.cardTitle}>
        Check my ballot was counted
      </summary>
      <form
        className={styles.inline}
        onSubmit={(e) => {
          e.preventDefault();
          verify.mutate({ id: electionId, code: code.trim().toLowerCase() });
        }}
      >
        <label htmlFor="ballot-code" className="sr-only">
          Ballot code
        </label>
        <input
          id="ballot-code"
          className={styles.input}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="32-character ballot code"
          pattern="[0-9a-fA-F]{32}"
          required
        />
        <Button type="submit" size="sm" loading={verify.isPending}>
          Check
        </Button>
      </form>
      {verify.data && (
        <Notice tone="success">
          Counted ✓ — for{" "}
          {verify.data.candidacies
            .map((id) => names.get(String(id)) ?? "a candidate")
            .join(", ")}
          .
        </Notice>
      )}
      {verify.error && (
        <Notice tone="danger">
          {getErrorMessage(verify.error, {
            404: "No ballot with that code in this election.",
          })}
        </Notice>
      )}
    </details>
  );
}

function Results({ results, election, seedHash }) {
  const top = Math.max(1, ...results.tallies.map((t) => t.votes));
  const winners = new Set(results.winners.map(String));
  return (
    <section className={styles.card} aria-labelledby="results">
      <h2 id="results" className={styles.cardTitle}>
        {results.provisional ? "Provisional count" : "Certified results"}
      </h2>
      <p className={styles.meta}>
        {results.ballots} ballot{results.ballots === 1 ? "" : "s"}
        {results.eligibleVoters != null &&
          ` of ${results.eligibleVoters} eligible voters`}
        {results.provisional && " · not final until the dispute window closes"}
      </p>
      <ol className={styles.tallies}>
        {results.tallies.map((t) => (
          <li key={t.candidacy} className={styles.tally}>
            <span>
              {t.displayName}
              {winners.has(String(t.candidacy)) &&
                (results.provisional ? " · leading" : " · elected ✓")}
            </span>
            <span className={styles.bar}>
              <span style={{ width: `${(t.votes / top) * 100}%` }} />
            </span>
            <span className={styles.votes}>{t.votes}</span>
          </li>
        ))}
      </ol>
      {results.tallies.length === 0 && (
        <p className={styles.meta}>No votes were recorded.</p>
      )}
      {results.tieBreak?.applied && (
        <Notice tone="info">
          Tie: {results.tieBreak.detail}. Settled by{" "}
          {TIE_BREAKS[results.tieBreak.method] ?? results.tieBreak.method}.
          {results.tieBreak.seed &&
            ` Seed ${results.tieBreak.seed} (its hash ${seedHash} was published before voting).`}
        </Notice>
      )}
      {election.phase === "void" && (
        <Notice tone="info">
          Nobody received a vote, so nobody was elected.
        </Notice>
      )}
      {results.hash && (
        <p className={styles.fine}>
          Results seal: <code>{results.hash}</code>
        </p>
      )}
    </section>
  );
}

function CampaignFeed({ items, names, questions }) {
  return (
    <section className={styles.section} aria-labelledby="campaign">
      <h2 id="campaign" className={styles.sectionTitle}>
        Campaign trail
      </h2>
      <ol className={styles.feed}>
        {items.map((i) => (
          <li key={i.id} className={styles.card}>
            <p className={styles.kicker}>
              {names.get(String(i.candidacy)) ?? "Candidate"} ·{" "}
              {i.kind === "debate-answer" ? "Debate" : i.kind} ·{" "}
              {when(i.createdAt)}
            </p>
            {i.kind === "debate-answer" && questions[i.question] && (
              <p className={styles.meta}>Q: {questions[i.question]}</p>
            )}
            {i.title && <h3 className={styles.cardTitle}>{i.title}</h3>}
            <p className={styles.body}>{i.body}</p>
            {i.location && (
              <p className={styles.meta}>
                📍 {i.location}
                {i.startsAt && ` · ${when(i.startsAt)}`}
              </p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function Dispute({ electionId }) {
  const file = useFileDispute();
  const [reason, setReason] = useState("");
  if (file.isSuccess)
    return (
      <Notice tone="success">
        Dispute filed. Results stay provisional until an election officer
        reviews it.
      </Notice>
    );
  return (
    <details className={styles.card}>
      <summary className={styles.cardTitle}>
        Something wrong? File a dispute
      </summary>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          file.mutate({ id: electionId, reason });
        }}
      >
        <label htmlFor="dispute" className={styles.label}>
          What happened?
        </label>
        <textarea
          id="dispute"
          className={styles.textarea}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={1000}
          rows={3}
          required
        />
        {file.error && (
          <Notice tone="danger">{getErrorMessage(file.error)}</Notice>
        )}
        <Button type="submit" size="sm" loading={file.isPending}>
          File dispute
        </Button>
      </form>
    </details>
  );
}
