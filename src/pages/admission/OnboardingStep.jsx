import { LuCircleCheck, LuMapPin } from "react-icons/lu";
import { useCompleteStep } from "../../hooks/useStudentQueries";
import { useMissions } from "../../hooks/useLearningQueries";
import { useCampusWorld } from "../../hooks/useCampusQueries";
import { getErrorMessage } from "../../lib/errorMessages";
import { firstMission, stepPlace } from "../../lib/journey";
import Button from "../../components/ui/Button";
import Notice from "../../components/ui/Notice";
import Panel from "../../components/ui/Panel";
import MatricCard from "../../components/MatricCard";
import HallChooser from "./HallChooser";
import styles from "./OnboardingStep.module.css";

const prettySlug = (slug) =>
  slug.replaceAll("-", " ").replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Matriculated → orientation week: the university's onboarding steps. Steps at a campus
 * place complete by WALKING there in the 3D world (the server checks you arrived);
 * the rest are ticked here. Then the first exploration mission.
 */
export default function OnboardingStep({ student }) {
  const complete = useCompleteStep();
  const { steps, completed, total } = student.onboarding;
  const finished = student.status !== "matriculated";
  const missions = useMissions({ enabled: finished });
  const mission = firstMission(missions.data);
  const next = steps.find((s) => !s.completed);
  const world = useCampusWorld();
  const names = new Map(
    (world.data?.locations ?? []).map((l) => [l.slug, l.name]),
  );
  const placeName = (slug) => names.get(slug) ?? prettySlug(slug);
  const stalite = student.studentType === "stalite";
  const hallStep = steps.find((s) => s.kind === "hostel" && !s.completed);

  return (
    <div className={styles.stack}>
      <MatricCard student={student} />

      <Panel>
        <div className={styles.head}>
          <h1 className={styles.heading}>
            {finished
              ? stalite
                ? "Welcome back to campus"
                : "Orientation complete"
              : stalite
                ? "Move-in day"
                : "Orientation week"}
          </h1>
          <span className={styles.count}>
            {completed}/{total}
          </span>
        </div>
        <p className={styles.sub}>
          {finished
            ? "You're officially a (game) student. Welcome to campus!"
            : stalite
              ? "You're a returning student (stalite): choose your hall and move in."
              : "Walk to each place on campus — the step ticks itself when you arrive. Tap “Guide me” and follow the trail."}
        </p>

        {!finished && next && stepPlace(next) && (
          <Button
            to={`/play?guide=${stepPlace(next)}`}
            size="lg"
            className={styles.cta}
          >
            Start orientation on campus
          </Button>
        )}

        {hallStep && <HallChooser />}

        {complete.error && (
          <Notice tone="danger">{getErrorMessage(complete.error)}</Notice>
        )}

        <ul className={styles.list}>
          {steps.map((step) => {
            const place = stepPlace(step);
            return (
              <li
                key={step.key}
                className={step.completed ? styles.itemDone : styles.item}
              >
                <div className={styles.itemText}>
                  <p className={styles.itemTitle}>{step.title}</p>
                  {step.description && (
                    <p className={styles.itemDesc}>{step.description}</p>
                  )}
                  {place && (
                    <p className={styles.place}>
                      <LuMapPin aria-hidden="true" /> {placeName(place)}
                    </p>
                  )}
                </div>
                {step.completed ? (
                  <LuCircleCheck className={styles.tick} aria-label="Done" />
                ) : place ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    to={`/play?guide=${place}`}
                  >
                    Guide me
                  </Button>
                ) : step.kind === "hostel" ? null : (
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={
                      complete.isPending && complete.variables === step.key
                    }
                    onClick={() => complete.mutate(step.key)}
                  >
                    Done
                  </Button>
                )}
              </li>
            );
          })}
        </ul>

        {finished && (
          <div className={styles.next}>
            {mission && !mission.complete ? (
              <>
                <p className={styles.itemTitle}>
                  Your first mission: {mission.title}
                </p>
                <p className={styles.itemDesc}>
                  {mission.steps.filter((s) => s.done).length}/
                  {mission.steps.length} done · {mission.xp} XP. It’s shown on
                  campus too.
                </p>
                <div className={styles.actions}>
                  <Button to="/play" size="lg">
                    Continue on campus
                  </Button>
                  <Button to="/dashboard" variant="secondary">
                    My dashboard
                  </Button>
                </div>
              </>
            ) : (
              <Button to="/dashboard" size="lg" className={styles.cta}>
                Go to my dashboard
              </Button>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}
