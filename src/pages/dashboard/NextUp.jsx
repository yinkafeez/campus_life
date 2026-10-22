import { Link } from "react-router-dom";
import { LuChevronRight } from "react-icons/lu";
import Panel from "../../components/ui/Panel";
import { useMissions } from "../../hooks/useLearningQueries";
import { useElections } from "../../hooks/useElectionQueries";
import { useBills } from "../../hooks/useEconomyQueries";
import { currentObjective } from "../../lib/journey";
import styles from "./DashboardPage.module.css";

/**
 * "What should I do now?" — the few things that need the player, each one tap away:
 * the current mission objective, an election you can vote in, a bill that's due.
 */
export default function NextUp({ student }) {
  const missions = useMissions();
  const elections = useElections();
  const bills = useBills();

  const objective = currentObjective({ student, missions: missions.data });
  const vote = (elections.data ?? []).find(
    (e) => e.phase === "voting" && !e.hasVoted,
  );
  const bill = (bills.data ?? []).find((b) => b.status === "due");
  const items = [
    objective && {
      key: "mission",
      label: objective.step
        ? `${objective.title}: ${objective.step.label}`
        : `${objective.title}: claim your reward`,
      to: objective.step?.place
        ? `/play?guide=${objective.step.place}`
        : "/studies?tab=missions",
    },
    vote && {
      key: "vote",
      label: `Voting is open: ${vote.title}`,
      to: `/elections/${vote.id}`,
    },
    bill && {
      key: "bill",
      label: `Bill due: ${bill.label}`,
      to: "/money",
    },
  ].filter(Boolean);

  return (
    <Panel className={styles.next} aria-labelledby="next-up">
      <h2 id="next-up" className={styles.sectionTitle}>
        Next up
      </h2>
      {items.length ? (
        <ul className={styles.nextList}>
          {items.map((it) => (
            <li key={it.key}>
              <Link to={it.to} className={styles.nextItem}>
                <span>{it.label}</span>
                <LuChevronRight aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.note}>
          You’re all caught up. Explore campus, try a hustle, or challenge a
          friend in Games.
        </p>
      )}
    </Panel>
  );
}
