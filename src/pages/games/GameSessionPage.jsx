import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { LuArrowLeft, LuClock } from "react-icons/lu";
import Button from "../../components/ui/Button";
import Notice from "../../components/ui/Notice";
import PageLoader from "../../components/ui/PageLoader";
import { useGameSession, useSubmitSession } from "../../hooks/useGamesQueries";
import { getErrorMessage } from "../../lib/errorMessages";
import { toast } from "../../stores/useToastStore";
import TriviaGame from "./TriviaGame";
import PenaltyGame from "./PenaltyGame";
import styles from "./Games.module.css";

const GAMES = {
  trivia: {
    View: TriviaGame,
    ready: (view, a) => view.questions.every((q) => a?.answers?.[q.id]),
  },
  penalties: {
    View: PenaltyGame,
    ready: (view, a) =>
      a?.kicks?.length === view.kicks && a.kicks.every(Boolean),
  },
};

// /games/play/:id — play one game session; the server scores it.
export default function GameSessionPage() {
  const { id } = useParams();
  const game = useGameSession(id);
  const submit = useSubmitSession();
  const [answer, setAnswer] = useState({});
  const [outcome, setOutcome] = useState(null);

  if (game.isPending) return <PageLoader label="Setting up the game…" />;
  if (game.error)
    return (
      <div className={styles.page}>
        <Notice tone="danger">{getErrorMessage(game.error)}</Notice>
      </div>
    );
  const { session, view } = game.data;
  const def = GAMES[session.type];
  const over = outcome || session.status !== "started";

  function send() {
    submit.mutate(
      { id, answer },
      {
        onSuccess: (data) => {
          setOutcome(data);
          if (data.session.coins)
            toast({
              title: "Prize",
              text: `+${data.session.coins} CC`,
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

  return (
    <div className={styles.page}>
      <Link to="/games" className={styles.back}>
        <LuArrowLeft aria-hidden="true" /> Back to games
      </Link>
      <header className={styles.playHead}>
        <h1 className={styles.title}>
          {session.type === "trivia" ? "Campus trivia" : "Penalty shootout"}
        </h1>
        <span className={styles.badge}>{session.mode}</span>
        {!over && <Countdown until={session.expiresAt} />}
      </header>

      {outcome ? (
        <Result type={session.type} data={outcome} />
      ) : session.status !== "started" ? (
        <Notice>This game is over ({session.status}).</Notice>
      ) : (
        <section className={styles.card}>
          <def.View
            view={view}
            value={answer}
            onChange={setAnswer}
            disabled={submit.isPending}
          />
          {submit.error && (
            <Notice tone="danger">{getErrorMessage(submit.error)}</Notice>
          )}
          <Button
            onClick={send}
            loading={submit.isPending}
            disabled={!def.ready(view, answer)}
          >
            {session.type === "penalties"
              ? "Take the penalties"
              : "Submit answers"}
          </Button>
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
  return (
    <span
      className={left < 20_000 ? styles.timerLow : styles.timer}
      role="timer"
    >
      <LuClock aria-hidden="true" /> {Math.floor(left / 60000)}:
      {String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}
    </span>
  );
}

function Result({ type, data }) {
  const { result, duel, session } = data;
  return (
    <section className={styles.result} aria-label="Result">
      <p className={styles.score}>
        {type === "penalties"
          ? `${result.goals} / 5 goals`
          : `${result.score} points (${result.correct}/${result.total} correct)`}
      </p>
      {session.coins > 0 && <p className={styles.prize}>+{session.coins} CC</p>}
      {duel && (
        <p className={styles.meta}>
          {duel.waiting
            ? "Duel: waiting for your opponent to play."
            : duel.draw
              ? "Duel: it's a draw."
              : duel.youWon
                ? "Duel: you won! 🎉"
                : "Duel: you lost this one."}
        </p>
      )}
      {session.mode === "competition" && (
        <p className={styles.meta}>
          Your best score counts on the competition table.
        </p>
      )}
      <ul className={styles.list}>
        {result.details.map((d, i) =>
          type === "penalties" ? (
            <li key={d.kick} className={styles.row}>
              Kick {d.kick}: {d.direction} {d.height} — keeper went {d.keeper} →{" "}
              <strong>
                {d.outcome === "goal"
                  ? "GOAL"
                  : d.outcome === "over"
                    ? "over the bar"
                    : "saved"}
              </strong>
            </li>
          ) : (
            <li key={d.id} className={styles.row}>
              Q{i + 1}: {d.correct ? "✓ correct" : `✗ answer: ${d.answer}`}
            </li>
          ),
        )}
      </ul>
      <Button to="/games" size="sm" variant="secondary">
        More games
      </Button>
    </section>
  );
}
