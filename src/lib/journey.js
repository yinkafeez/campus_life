/*
 * THE FRESHER JOURNEY — one ordered path from a new account to free play:
 *   admission (apply → review → offer) → your look → matriculation →
 *   orientation (walk to each onboarding place on campus) → first exploration mission.
 * The server decides every status; this only works out where the player is and what's next.
 */
export const JOURNEY_STAGES = [
  { key: "apply", label: "Apply" },
  { key: "review", label: "Review" },
  { key: "offer", label: "Offer" },
  { key: "look", label: "Your look" },
  { key: "matric", label: "Matric" },
  // soft hyphen (­): "Orien-tation" breaks neatly on narrow phones
  { key: "orientation", label: "Orien­tation" },
  { key: "mission", label: "First mission" },
];

/** The first exploration mission: a one-off mission with steps out on campus. */
export const firstMission = (missions = []) =>
  missions.find(
    (m) =>
      !m.perLevel &&
      m.steps.some((s) =>
        ["discover-location", "campus-activity"].includes(s.type),
      ),
  ) ?? null;

/** Index into JOURNEY_STAGES (JOURNEY_STAGES.length = the journey is finished). */
export function journeyIndex({ student, hasCharacter, missions }) {
  if (!student || student.status === "declined") return 0;
  switch (student.status) {
    case "under_review":
      return 1;
    case "offered":
      return 2;
    case "accepted":
      return hasCharacter ? 4 : 3;
    case "matriculated":
      return 5;
    default: {
      const mission = firstMission(missions);
      return mission && !mission.complete ? 6 : JOURNEY_STAGES.length;
    }
  }
}

/** The location a step happens at (onboarding steps and mission steps). */
export const stepPlace = (step) =>
  step.location ??
  (["discover-location", "campus-activity"].includes(step.type)
    ? step.ref?.split("/")[0]
    : null);

/**
 * The objective to show on campus, or null when the journey is over:
 * { stage, title, done, total, step: { key, label, place } }.
 */
export function currentObjective({ student, missions }) {
  if (student?.status === "matriculated") {
    const steps = student.onboarding?.steps ?? [];
    const next = steps.find((s) => !s.completed);
    if (!next) return null;
    return {
      stage: "orientation",
      title: "Orientation",
      done: steps.filter((s) => s.completed).length,
      total: steps.length,
      step: { key: next.key, label: next.title, place: stepPlace(next) },
    };
  }
  if (["active", "graduated"].includes(student?.status)) {
    const mission = firstMission(missions);
    if (!mission || mission.complete) return null;
    const next = mission.steps.find((s) => !s.done);
    return {
      stage: "mission",
      title: mission.title,
      done: mission.steps.filter((s) => s.done).length,
      total: mission.steps.length,
      step: next
        ? { key: next.key, label: next.label, place: stepPlace(next) }
        : null, // every step done: the reward is waiting in Studies
      missionKey: mission.key,
    };
  }
  return null;
}
