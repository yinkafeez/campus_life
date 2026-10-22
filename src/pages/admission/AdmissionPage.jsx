import { useMyStudent } from "../../hooks/useStudentQueries";
import { useMyCharacter } from "../../hooks/useCharacterQueries";
import { useMissions } from "../../hooks/useLearningQueries";
import { journeyIndex } from "../../lib/journey";
import PageLoader from "../../components/ui/PageLoader";
import ErrorState from "../../components/ui/ErrorState";
import SimulatedBanner from "../../components/SimulatedBanner";
import JourneyTracker from "./JourneyTracker";
import ApplyStep from "./ApplyStep";
import ReviewStep from "./ReviewStep";
import OfferStep from "./OfferStep";
import MatriculationStep from "./MatriculationStep";
import OnboardingStep from "./OnboardingStep";
import styles from "./AdmissionPage.module.css";

// The fresher journey. The SERVER decides the stage (student.status); this page just shows it.
export default function AdmissionPage() {
  const student = useMyStudent();
  const character = useMyCharacter();
  const enrolled = ["active", "graduated"].includes(student.data?.status);
  const missions = useMissions({ enabled: enrolled });

  function renderStage(s) {
    if (!s || s.status === "declined")
      return <ApplyStep declined={Boolean(s)} />;
    switch (s.status) {
      case "under_review":
        return <ReviewStep student={s} />;
      case "offered":
        return <OfferStep student={s} />;
      case "accepted":
        return (
          <MatriculationStep
            student={s}
            hasCharacter={Boolean(character.data)}
          />
        );
      default:
        return <OnboardingStep student={s} />;
    }
  }

  if (student.isPending || character.isPending)
    return <PageLoader label="Loading your admission…" />;
  if (student.error)
    return <ErrorState error={student.error} onRetry={student.refetch} />;

  return (
    <div className={styles.page}>
      <JourneyTracker
        index={journeyIndex({
          student: student.data,
          hasCharacter: Boolean(character.data),
          missions: missions.data,
        })}
      />
      {renderStage(student.data)}
      <SimulatedBanner text={student.data?.disclaimer} />
    </div>
  );
}
