import { LuShirt } from "react-icons/lu";
import { useMatriculate } from "../../hooks/useStudentQueries";
import { getErrorMessage } from "../../lib/errorMessages";
import Button from "../../components/ui/Button";
import Notice from "../../components/ui/Notice";
import Panel from "../../components/ui/Panel";
import styles from "./MatriculationStep.module.css";

// Offer accepted → (create your look) → matriculate. The number is generated on the server.
export default function MatriculationStep({ student, hasCharacter }) {
  const matriculate = useMatriculate();

  if (!hasCharacter)
    return (
      <Panel className={styles.panel}>
        <p className={styles.eyebrow}>Offer accepted · step 4 of 7</p>
        <h1 className={styles.heading}>Create your look</h1>
        <p className={styles.text}>
          Before matriculation, choose how you look on campus: skin tone, hair
          and clothes. This is also the photo on your game student ID card. You
          can change it any time in the wardrobe.
        </p>
        <Button to="/character?next=/admission" size="lg">
          <LuShirt aria-hidden="true" /> Create my character
        </Button>
      </Panel>
    );

  return (
    <Panel className={styles.panel}>
      <p className={styles.eyebrow}>Offer accepted · step 5 of 7</p>
      <h1 className={styles.heading}>Matriculation day</h1>
      <p className={styles.text}>
        Take the oath and receive your <strong>fictional</strong> game matric
        number for {student.programme.name} at {student.university.shortName}.
        Next comes orientation week on campus.
      </p>

      {matriculate.error && (
        <Notice tone="danger">{getErrorMessage(matriculate.error)}</Notice>
      )}

      <Button
        size="lg"
        loading={matriculate.isPending}
        onClick={() => matriculate.mutate()}
      >
        Matriculate
      </Button>
    </Panel>
  );
}
