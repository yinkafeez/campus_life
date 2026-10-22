import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { LuAward, LuLock } from "react-icons/lu";
import Button from "../../components/ui/Button";
import Notice from "../../components/ui/Notice";
import PageLoader from "../../components/ui/PageLoader";
import {
  useAnswerChallenge,
  useChallenges,
  useCompetitions,
  useCreateChallenge,
  useEnterCompetition,
  useGameAchievements,
  useGames,
  useLeaderboard,
  usePlayChallenge,
  usePlayCompetition,
  useStartSolo,
} from "../../hooks/useGamesQueries";
import { useFriends } from "../../hooks/useSocialQueries";
import { useGroups } from "../../hooks/useCommunityQueries";
import { queryKeys } from "../../hooks/queryKeys";
import { getErrorMessage } from "../../lib/errorMessages";
import styles from "./Games.module.css";
import ErrorState from "../../components/ui/ErrorState";

const TABS = [
  ["play", "Play"],
  ["duels", "Duels"],
  ["events", "Campus events"],
  ["leaderboards", "Leaderboards"],
  ["achievements", "Achievements"],
];

/** Open a session returned by the API: cache it, then go to the play screen. */
function useOpenSession() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return (data) => {
    queryClient.setQueryData(
      queryKeys.gameSession(String(data.session.id)),
      data,
    );
    navigate(`/games/play/${data.session.id}`);
  };
}

// /games — mini-games, duels, campus competitions, leaderboards and achievements.
export default function GamesPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([k]) => k === params.get("tab"))
    ? params.get("tab")
    : "play";
  const games = useGames();

  if (games.isPending) return <PageLoader label="Loading games…" />;
  if (games.error)
    return (
      <div className={styles.page}>
        <ErrorState error={games.error} onRetry={games.refetch} />
      </div>
    );
  const playable = games.data.filter((g) => g.implemented && g.available);

  return (
    <div className={styles.page}>
      <header>
        <h1 className={styles.title}>Games & sports</h1>
        <p className={styles.muted}>
          Play, challenge friends, and compete in campus events. Scores are
          checked by the server.
        </p>
      </header>
      <nav className={styles.tabs} role="tablist" aria-label="Games">
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
      {tab === "play" && <Play games={games.data} />}
      {tab === "duels" && <Duels playable={playable} />}
      {tab === "events" && <Events />}
      {tab === "leaderboards" && <Leaderboards playable={playable} />}
      {tab === "achievements" && <Achievements />}
    </div>
  );
}

function Play({ games }) {
  const start = useStartSolo();
  const open = useOpenSession();
  return (
    <>
      {start.error && (
        <ErrorState error={start.error} onRetry={start.refetch} />
      )}
      <ul className={styles.grid}>
        {games.map((g) => (
          <li
            key={g.key}
            className={g.implemented ? styles.game : styles.gameLocked}
          >
            <p className={styles.sport}>{g.sport}</p>
            <h2 className={styles.cardTitle}>
              {!g.implemented && <LuLock aria-hidden="true" />} {g.name}
            </h2>
            <p className={styles.muted}>{g.scope}</p>
            {g.stats && (
              <p className={styles.meta}>
                Best {g.stats.best} · played {g.stats.played} · rating{" "}
                {g.stats.rating}
              </p>
            )}
            {g.implemented ? (
              <Button
                size="sm"
                disabled={!g.available}
                loading={start.isPending && start.variables === g.key}
                onClick={() => start.mutate(g.key, { onSuccess: open })}
              >
                Play solo
              </Button>
            ) : (
              <p className={styles.badge}>Coming later</p>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function Duels({ playable }) {
  const challenges = useChallenges();
  const friends = useFriends();
  const create = useCreateChallenge();
  const answer = useAnswerChallenge();
  const play = usePlayChallenge();
  const open = useOpenSession();
  const [type, setType] = useState(playable[0]?.key ?? "trivia");
  const [opponent, setOpponent] = useState("");
  const error = create.error ?? answer.error ?? play.error;

  return (
    <>
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>New duel</h2>
        <div className={styles.inline}>
          <select
            className={styles.select}
            value={type}
            onChange={(e) => setType(e.target.value)}
            aria-label="Game"
          >
            {playable.map((g) => (
              <option key={g.key} value={g.key}>
                {g.name}
              </option>
            ))}
          </select>
          <select
            className={styles.select}
            value={opponent}
            onChange={(e) => setOpponent(e.target.value)}
            aria-label="Opponent"
          >
            <option value="">Quick match (anyone)</option>
            {(friends.data?.friends ?? []).map((f) => (
              <option key={f.playerId} value={f.playerId}>
                Challenge {f.displayName}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            loading={create.isPending}
            onClick={() =>
              create.mutate({ type, opponentId: opponent || undefined })
            }
          >
            {opponent ? "Send challenge" : "Find a match"}
          </Button>
        </div>
        <p className={styles.muted}>
          Both players get the same game. Higher score wins; results stay hidden
          until you've both played.
        </p>
      </section>
      {error && <Notice tone="danger">{getErrorMessage(error)}</Notice>}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Your duels</h2>
        {challenges.data?.length === 0 && (
          <p className={styles.muted}>No duels yet.</p>
        )}
        <ul className={styles.list}>
          {challenges.data?.map((c) => {
            // an invited friend answers first; everyone else can play straight away
            const meIsOpponent =
              c.role === "opponent" && c.status === "waiting";
            return (
              <li key={c.id} className={styles.row}>
                <span className={styles.rowMain}>
                  <span className={styles.rowTitle}>
                    {c.type} · {c.challenger?.displayName} vs{" "}
                    {c.opponent?.displayName ?? "…waiting for an opponent"}
                  </span>
                  <span className={styles.muted}>
                    {c.status}
                    {c.myResult !== null && ` · your score ${c.myResult}`}
                    {c.status === "finished" &&
                      (c.draw
                        ? " · draw"
                        : c.youWon
                          ? " · you won!"
                          : ` · ${c.winner?.displayName} won`)}
                  </span>
                </span>
                {meIsOpponent && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => answer.mutate({ id: c.id, accept: true })}
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => answer.mutate({ id: c.id, accept: false })}
                    >
                      Decline
                    </Button>
                  </>
                )}
                {["waiting", "ready"].includes(c.status) &&
                  c.myResult === null &&
                  !meIsOpponent && (
                    <Button
                      size="sm"
                      onClick={() => play.mutate(c.id, { onSuccess: open })}
                    >
                      Play
                    </Button>
                  )}
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

const when = (iso) =>
  new Date(iso).toLocaleString("en-NG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

function Events() {
  const competitions = useCompetitions();
  const groups = useGroups();
  const enter = useEnterCompetition();
  const play = usePlayCompetition();
  const open = useOpenSession();
  const [groupFor, setGroupFor] = useState({});
  if (competitions.isPending) return <p className={styles.muted}>Loading…</p>;
  if (competitions.error)
    return (
      <ErrorState error={competitions.error} onRetry={competitions.refetch} />
    );
  const myGroups = (groups.data ?? []).filter((g) => g.isMember);
  const error = enter.error ?? play.error;

  return (
    <>
      {error && <Notice tone="danger">{getErrorMessage(error)}</Notice>}
      {competitions.data.map((c) => (
        <section key={c.id} className={styles.card}>
          <div className={styles.eventHead}>
            <div>
              <h2 className={styles.cardTitle}>{c.title}</h2>
              <p className={styles.muted}>
                {c.type} · {when(c.startsAt)} – {when(c.endsAt)}
                {c.teams === "groups" &&
                  ` · teams (best ${c.teamSize} per group)`}
              </p>
            </div>
            <span className={c.phase === "live" ? styles.live : styles.badge}>
              {c.phase}
            </span>
          </div>
          {c.description && <p className={styles.muted}>{c.description}</p>}
          <p className={styles.meta}>
            Prizes:{" "}
            {c.rewards.map((r) => `#${r.rank} ${r.coins} CC`).join(" · ") ||
              "glory"}{" "}
            · {c.maxAttempts} tries each
            {c.myEntry &&
              ` · you: best ${c.myEntry.best}, ${c.myEntry.attempts}/${c.maxAttempts} tries used`}
          </p>
          {c.phase === "live" && (
            <div className={styles.inline}>
              {c.teams === "groups" && !c.myEntry && (
                <>
                  <select
                    className={styles.select}
                    value={groupFor[c.id] ?? ""}
                    onChange={(e) =>
                      setGroupFor((g) => ({ ...g, [c.id]: e.target.value }))
                    }
                    aria-label="Your team"
                  >
                    <option value="">Play for…</option>
                    {myGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    disabled={!groupFor[c.id]}
                    onClick={() =>
                      enter.mutate({ id: c.id, groupId: groupFor[c.id] })
                    }
                  >
                    Join with team
                  </Button>
                </>
              )}
              {(c.teams === "solo" || c.myEntry) && (
                <Button
                  size="sm"
                  disabled={c.myEntry?.attempts >= c.maxAttempts}
                  loading={play.isPending && play.variables === c.id}
                  onClick={() => play.mutate(c.id, { onSuccess: open })}
                >
                  {c.myEntry?.attempts >= c.maxAttempts
                    ? "No tries left"
                    : "Play now"}
                </Button>
              )}
            </div>
          )}
          {c.standings.length > 0 && (
            <ol className={styles.standings}>
              {c.standings.map((s) => (
                <li key={s.rank}>
                  <span className={styles.rank}>#{s.rank}</span>{" "}
                  {s.name ?? s.displayName}{" "}
                  <span className={styles.muted}>{s.score}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      ))}
    </>
  );
}

function Leaderboards({ playable }) {
  const [type, setType] = useState(playable[0]?.key ?? "trivia");
  const [metric, setMetric] = useState("best");
  const board = useLeaderboard(type, metric);
  return (
    <section className={styles.card}>
      <div className={styles.inline}>
        <select
          className={styles.select}
          value={type}
          onChange={(e) => setType(e.target.value)}
          aria-label="Game"
        >
          {playable.map((g) => (
            <option key={g.key} value={g.key}>
              {g.name}
            </option>
          ))}
        </select>
        <select
          className={styles.select}
          value={metric}
          onChange={(e) => setMetric(e.target.value)}
          aria-label="Rank by"
        >
          <option value="best">Best score</option>
          <option value="rating">Duel rating</option>
          <option value="wins">Duel wins</option>
        </select>
      </div>
      {board.data?.entries.length === 0 && (
        <p className={styles.muted}>Nobody has played yet. Be the first!</p>
      )}
      <ol className={styles.standings}>
        {board.data?.entries.map((e) => (
          <li key={e.rank}>
            <span className={styles.rank}>#{e.rank}</span> {e.displayName}{" "}
            <span className={styles.muted}>@{e.username}</span>{" "}
            <strong>{e.value}</strong>
          </li>
        ))}
      </ol>
      {board.data?.me && (
        <p className={styles.meta}>
          You: #{board.data.me.rank} ({board.data.me.value})
        </p>
      )}
    </section>
  );
}

function Achievements() {
  const list = useGameAchievements();
  return (
    <ul className={styles.grid}>
      {list.data?.map((a) => (
        <li key={a.key} className={a.earned ? styles.game : styles.gameLocked}>
          <LuAward className={styles.trophy} aria-hidden="true" />
          <h2 className={styles.cardTitle}>{a.title}</h2>
          <p className={styles.muted}>{a.description}</p>
          <p className={styles.meta}>{a.earned ? "Earned" : "Locked"}</p>
        </li>
      ))}
    </ul>
  );
}
