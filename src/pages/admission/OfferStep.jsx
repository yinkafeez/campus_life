import { useRespondToOffer } from "../../hooks/useStudentQueries";
import { getErrorMessage } from "../../lib/errorMessages";
import { formatDate } from "../../lib/format";
import Button from "../../components/ui/Button";
import Notice from "../../components/ui/Notice";
import styles from "./OfferStep.module.css";

// The (simulated) offer letter. Watermarked so it can never pass for a real one.
export default function OfferStep({ student }) {
  const respond = useRespondToOffer();

  return (
    <article className={styles.letter} aria-labelledby="offer-title">
      <span className={styles.watermark} aria-hidden="true">
        GAME SIMULATION
      </span>

      <header className={styles.head}>
        <p className={styles.from}>
          {student.university.name} · Admissions (game)
        </p>
        <p className={styles.date}>{formatDate(student.admission.offeredAt)}</p>
      </header>

      <h1 id="offer-title" className={styles.title}>
        Offer of Provisional Admission
      </h1>

      <p className={styles.body}>
        Congratulations! You have been offered a place to study{" "}
        <strong>
          {student.programme.award} {student.programme.name}
        </strong>{" "}
        in the {student.department.name}, {student.faculty.name}, starting at{" "}
        <strong>{student.entryLevel.label}</strong>.
      </p>
      <p className={styles.fine}>{student.disclaimer}</p>

      {respond.error && (
        <Notice tone="danger">{getErrorMessage(respond.error)}</Notice>
      )}

      <div className={styles.actions}>
        <Button
          size="lg"
          loading={respond.isPending && respond.variables === true}
          onClick={() => respond.mutate(true)}
        >
          Accept offer
        </Button>
        <Button
          variant="ghost"
          loading={respond.isPending && respond.variables === false}
          onClick={() => respond.mutate(false)}
        >
          Decline
        </Button>
      </div>
    </article>
  );
}
