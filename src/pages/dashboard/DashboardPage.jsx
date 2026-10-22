import { Navigate } from "react-router-dom";
import { LuMap } from "react-icons/lu";
import { useCurrentUser } from "../../hooks/useAuthQueries";
import { useMyStudent } from "../../hooks/useStudentQueries";
import PageLoader from "../../components/ui/PageLoader";
import ErrorState from "../../components/ui/ErrorState";
import NextUp from "./NextUp";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import MatricCard from "../../components/MatricCard";
import SimulatedBanner from "../../components/SimulatedBanner";
import LevelTrack from "./LevelTrack";
import styles from "./DashboardPage.module.css";

// The student dashboard: who you are, where you study, how far along you are.
export default function DashboardPage() {
  const { data: session } = useCurrentUser();
  const { data: student, isPending, error, refetch } = useMyStudent();

  if (isPending) return <PageLoader label="Loading your dashboard…" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  // not enrolled yet → the journey isn't finished
  if (!student || !["active", "graduated"].includes(student.status))
    return <Navigate to="/admission" replace />;

  const { player } = session;

  return (
    <div className={styles.page}>
      <header className={styles.welcome}>
        <p className={styles.eyebrow}>
          {student.session?.name} · {student.currentLevel.label}
        </p>
        <h1 className={styles.title}>Hi, {player.displayName}</h1>
      </header>

      <div className={styles.grid}>
        <NextUp student={student} />
        <MatricCard student={student} />

        <Panel className={styles.study}>
          <h2 className={styles.sectionTitle}>Studies</h2>
          <dl className={styles.facts}>
            <div>
              <dt>University</dt>
              <dd>{student.university.name}</dd>
            </div>
            <div>
              <dt>Faculty</dt>
              <dd>{student.faculty.name}</dd>
            </div>
            <div>
              <dt>Department</dt>
              <dd>{student.department.name}</dd>
            </div>
            <div>
              <dt>Programme</dt>
              <dd>
                {student.programme.award} {student.programme.name} (
                {student.programme.durationYears} years)
              </dd>
            </div>
          </dl>
        </Panel>

        <Panel className={styles.progress}>
          <div className={styles.progressHead}>
            <h2 className={styles.sectionTitle}>Progress</h2>
            <span className={styles.year}>
              Year {student.progress.yearOfStudy} of{" "}
              {student.progress.yearsTotal}
            </span>
          </div>
          <LevelTrack levels={student.progress.levels} />
          <p className={styles.note}>
            {student.status === "graduated"
              ? "You've completed every level in the game."
              : "Move up a level by earning game XP, passing activities and finishing your missions."}
          </p>
          <div className={styles.campusActions}>
            <Button to="/studies" size="sm">
              Studies
            </Button>
          </div>
        </Panel>

        <Panel className={styles.campus}>
          <LuMap className={styles.campusIcon} aria-hidden="true" />
          <div>
            <h2 className={styles.sectionTitle}>Enter campus</h2>
            <p className={styles.note}>
              Walk around {student.university.shortName} with your character,
              meet people and discover places.
            </p>
            <div className={styles.campusActions}>
              <Button to="/play" size="sm">
                Play
              </Button>
              <Button to="/character" size="sm" variant="secondary">
                Wardrobe
              </Button>
            </div>
          </div>
        </Panel>
      </div>

      <SimulatedBanner text={student.disclaimer} />
    </div>
  );
}
