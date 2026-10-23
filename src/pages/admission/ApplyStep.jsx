import { useState } from "react";
import {
  useAdmissionOptions,
  useApply,
  useUniversities,
} from "../../hooks/useStudentQueries";
import { getErrorMessage, getFieldErrors } from "../../lib/errorMessages";
import Button from "../../components/ui/Button";
import Field, { SelectInput } from "../../components/ui/Field";
import Notice from "../../components/ui/Notice";
import Panel from "../../components/ui/Panel";
import styles from "./ApplyStep.module.css";

const EMPTY = {
  university: "",
  faculty: "",
  department: "",
  programme: "",
  level: "",
};

// Pick university → faculty → department → programme → entry level, from configured options only.
export default function ApplyStep({ declined = false }) {
  const [choice, setChoice] = useState(EMPTY);
  const universities = useUniversities();
  const options = useAdmissionOptions(choice.university);
  const apply = useApply();

  const faculties = options.data?.faculties ?? [];
  const faculty = faculties.find((el) => el.code === choice.faculty);
  const department = faculty?.departments.find(
    (el) => el.code === choice.department,
  );
  const programme = department?.programmes.find(
    (el) => el.code === choice.programme,
  );
  const serverErrors = getFieldErrors(apply.error);

  // changing a choice clears everything below it
  function pick(field, value) {
    const order = Object.keys(EMPTY);
    const reset = Object.fromEntries(
      order.slice(order.indexOf(field) + 1).map((el) => [el, ""]),
    );
    setChoice((prev) => ({ ...prev, ...reset, [field]: value }));
    apply.reset();
  }

  function handleSubmit(e) {
    e.preventDefault();
    apply.mutate({
      universitySlug: choice.university,
      facultyCode: choice.faculty,
      departmentCode: choice.department,
      programmeCode: choice.programme,
      entryLevel: Number(choice.level),
    });
  }

  const ready = Boolean(programme && choice.level);

  return (
    <Panel>
      <h1 className={styles.heading}>Apply for admission</h1>
      <p className={styles.sub}>
        {declined
          ? "You declined your last offer. Choose again — any programme you like."
          : "Choose where and what you want to study. Your (simulated) application is reviewed in seconds."}
      </p>

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        {apply.error && (
          <Notice tone="danger">{getErrorMessage(apply.error)}</Notice>
        )}

        <Field label="University" htmlFor="university">
          <SelectInput
            id="university"
            value={choice.university}
            onChange={(e) => pick("university", e.target.value)}
            disabled={universities.isPending}
          >
            <option value="">
              {universities.isPending ? "Loading…" : "Choose a university"}
            </option>
            {universities.data?.universities.map((uni) => (
              <option key={uni.slug} value={uni.slug}>
                {uni.name} ({uni.shortName})
              </option>
            ))}
          </SelectInput>
        </Field>
        {universities.error && (
          <Notice tone="danger">{getErrorMessage(universities.error)}</Notice>
        )}

        {choice.university && (
          <Field
            label="Faculty"
            htmlFor="faculty"
            error={serverErrors.facultyCode}
          >
            <SelectInput
              id="faculty"
              value={choice.faculty}
              onChange={(e) => pick("faculty", e.target.value)}
              disabled={options.isPending}
            >
              <option value="">
                {options.isPending ? "Loading…" : "Choose a faculty"}
              </option>
              {faculties.map((el) => (
                <option key={el.code} value={el.code}>
                  {el.name}
                </option>
              ))}
            </SelectInput>
          </Field>
        )}

        {faculty && (
          <Field
            label="Department"
            htmlFor="department"
            error={serverErrors.departmentCode}
          >
            <SelectInput
              id="department"
              value={choice.department}
              onChange={(e) => pick("department", e.target.value)}
            >
              <option value="">Choose a department</option>
              {faculty.departments.map((el) => (
                <option key={el.code} value={el.code}>
                  {el.name}
                </option>
              ))}
            </SelectInput>
          </Field>
        )}

        {department && (
          <Field
            label="Programme"
            htmlFor="programme"
            error={serverErrors.programmeCode}
          >
            <SelectInput
              id="programme"
              value={choice.programme}
              onChange={(e) => pick("programme", e.target.value)}
            >
              <option value="">Choose a programme</option>
              {department.programmes.map((el) => (
                <option key={el.code} value={el.code}>
                  {el.award} {el.name} · {el.durationYears} years
                </option>
              ))}
            </SelectInput>
          </Field>
        )}

        {programme && (
          <fieldset className={styles.levels}>
            <legend className={styles.legend}>Entry level</legend>
            <p className={styles.levelHint}>
              Freshers start with orientation week at the Main Gate. Stalites
              (returning students) choose their hall and move straight in.
            </p>
            {programme.entryLevels.map((el) => (
              <label
                key={el.level}
                className={
                  choice.level === String(el.level)
                    ? styles.levelOn
                    : styles.level
                }
              >
                <input
                  type="radio"
                  name="level"
                  value={el.level}
                  checked={choice.level === String(el.level)}
                  onChange={(e) => pick("level", e.target.value)}
                  className="sr-only"
                />
                {el.label}
                {/* the lowest entry level is a fresher; above it a returning student */}
                <span className={styles.levelType}>
                  {el.level ===
                  Math.min(...programme.entryLevels.map((l) => l.level))
                    ? "Fresher"
                    : "Stalite"}
                </span>
              </label>
            ))}
            {serverErrors.entryLevel && (
              <p className={styles.error}>{serverErrors.entryLevel}</p>
            )}
          </fieldset>
        )}

        <Button
          type="submit"
          size="lg"
          disabled={!ready}
          loading={apply.isPending}
        >
          Submit application
        </Button>
      </form>
    </Panel>
  );
}
