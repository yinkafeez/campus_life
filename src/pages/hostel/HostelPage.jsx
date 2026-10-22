import { Link } from "react-router-dom";
import Button from "../../components/ui/Button";
import Notice from "../../components/ui/Notice";
import PageLoader from "../../components/ui/PageLoader";
import {
  useHostels,
  useMyAccommodation,
  useRequestBed,
  useVacateBed,
} from "../../hooks/useAccommodationQueries";
import { getErrorMessage } from "../../lib/errorMessages";
import styles from "./HostelPage.module.css";

const GENDER = { male: "Male hall", female: "Female hall", mixed: "Mixed" };
const STATUS = {
  active: "You have a bed space",
  applied: "Application submitted — waiting for the ballot",
  unsuccessful: "The ballot didn’t pick you this time",
};

// /hostel — simulated hall allocation: eligibility from each hall's rules, your bed, roommates.
export default function HostelPage() {
  const hostels = useHostels();
  const mine = useMyAccommodation();
  const request = useRequestBed();
  const vacate = useVacateBed();

  if (hostels.isPending || mine.isPending)
    return <PageLoader label="Checking the halls…" />;
  if (hostels.error?.code === "NOT_ENROLLED") {
    return (
      <div className={styles.page}>
        <Notice>
          Hostels open after admission.{" "}
          <Link to="/admission">Continue your admission</Link>.
        </Notice>
      </div>
    );
  }
  const error = hostels.error ?? mine.error;
  if (error) {
    return (
      <div className={styles.page}>
        <Notice tone="danger">{getErrorMessage(error)}</Notice>
      </div>
    );
  }

  const { assignment, roommates } = mine.data;
  const holding =
    assignment && ["active", "applied"].includes(assignment.status);
  const rules = hostels.data.rules;
  const actionError = request.error ?? vacate.error;

  return (
    <div className={styles.page}>
      <header>
        <h1 className={styles.title}>Hostel</h1>
        <p className={styles.muted}>
          A simulated bed space for your game character — not a real hostel
          allocation.
          {rules?.allocationStrategy === "lottery" &&
            " Ballot halls are allocated by lottery."}
        </p>
      </header>

      {assignment && (
        <section className={styles.mine}>
          <p className={styles.status}>{STATUS[assignment.status]}</p>
          <p className={styles.hall}>{assignment.hostel?.name}</p>
          {assignment.status === "active" && (
            <p className={styles.room}>
              Room {assignment.room} · Bed {assignment.bed}
            </p>
          )}
          {assignment.hostel?.accessRules && (
            <p className={styles.muted}>{assignment.hostel.accessRules}</p>
          )}
          {assignment.status === "active" && (
            <div>
              <p className={styles.label}>Roommates</p>
              {roommates.length === 0 ? (
                <p className={styles.muted}>
                  No roommates yet — the other beds are still free.
                </p>
              ) : (
                <ul className={styles.mates}>
                  {roommates.map((r) => (
                    <li key={r.playerId}>
                      <Link
                        to={`/players/${r.username}`}
                        className={styles.mate}
                      >
                        {r.displayName}
                      </Link>{" "}
                      <span className={styles.muted}>bed {r.bed}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {holding && (
            <div>
              <Button
                variant="ghost"
                onClick={() => vacate.mutate()}
                loading={vacate.isPending}
              >
                {assignment.status === "active"
                  ? "Move out"
                  : "Withdraw application"}
              </Button>
            </div>
          )}
        </section>
      )}
      {actionError && (
        <Notice tone="danger">{getErrorMessage(actionError)}</Notice>
      )}

      <section className={styles.grid}>
        {hostels.data.hostels.map((h) => (
          <article
            key={h.slug}
            className={h.eligible ? styles.hostel : styles.hostelOff}
          >
            <header className={styles.hostelHead}>
              <h2 className={styles.hostelName}>{h.name}</h2>
              <span className={styles.tag}>{GENDER[h.residentGender]}</span>
            </header>
            <p className={styles.muted}>
              {h.capacity
                ? `${h.bedsLeft} of ${h.capacity} game beds free · `
                : ""}
              {h.mode === "direct" ? "Book directly" : "Ballot"}
              {h.verification?.status !== "verified" &&
                " · details unconfirmed"}
            </p>
            {h.problems.length > 0 && (
              <ul className={styles.problems}>
                {h.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            {h.eligible && !holding && (
              <Button
                size="sm"
                onClick={() => request.mutate(h.slug)}
                loading={request.isPending && request.variables === h.slug}
                disabled={h.mode === "direct" && h.bedsLeft === 0}
              >
                {h.mode === "direct"
                  ? h.bedsLeft
                    ? "Book a bed"
                    : "Full"
                  : "Apply for the ballot"}
              </Button>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
