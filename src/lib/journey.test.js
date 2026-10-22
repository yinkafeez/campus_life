import { describe, expect, it } from "vitest";
import { currentObjective, journeyIndex, stepPlace } from "./journey";

const MISSION = {
  key: "fresher-first-week",
  title: "Fresher's first week",
  perLevel: false,
  complete: false,
  steps: [
    {
      key: "a",
      label: "Find the library",
      type: "discover-location",
      ref: "university-library",
      done: true,
    },
    {
      key: "b",
      label: "Study at the library",
      type: "campus-activity",
      ref: "university-library/study",
      done: false,
    },
    {
      key: "c",
      label: "Pass research skills",
      type: "pass-activity",
      ref: "x",
      done: false,
    },
  ],
};
const PER_LEVEL = {
  key: "dept",
  perLevel: true,
  complete: false,
  steps: [{ type: "pass-activities", done: false }],
};

describe("journey", () => {
  it("orders the stages from the server status", () => {
    expect(journeyIndex({ student: null })).toBe(0);
    expect(journeyIndex({ student: { status: "under_review" } })).toBe(1);
    expect(journeyIndex({ student: { status: "offered" } })).toBe(2);
    expect(
      journeyIndex({ student: { status: "accepted" }, hasCharacter: false }),
    ).toBe(3);
    expect(
      journeyIndex({ student: { status: "accepted" }, hasCharacter: true }),
    ).toBe(4);
    expect(journeyIndex({ student: { status: "matriculated" } })).toBe(5);
    expect(
      journeyIndex({
        student: { status: "active" },
        missions: [PER_LEVEL, MISSION],
      }),
    ).toBe(6);
    expect(
      journeyIndex({
        student: { status: "active" },
        missions: [{ ...MISSION, complete: true }],
      }),
    ).toBe(7);
  });

  it("points orientation at the next onboarding place", () => {
    const student = {
      status: "matriculated",
      onboarding: {
        steps: [
          {
            key: "id",
            title: "Collect your ID",
            location: "senate-house",
            completed: true,
          },
          {
            key: "lib",
            title: "Visit the library",
            location: "university-library",
            completed: false,
          },
        ],
      },
    };
    expect(currentObjective({ student })).toEqual({
      stage: "orientation",
      title: "Orientation",
      done: 1,
      total: 2,
      step: {
        key: "lib",
        label: "Visit the library",
        place: "university-library",
      },
    });
  });

  it("then follows the first exploration mission, skipping per-level missions", () => {
    const o = currentObjective({
      student: { status: "active" },
      missions: [PER_LEVEL, MISSION],
    });
    expect(o).toMatchObject({
      stage: "mission",
      done: 1,
      total: 3,
      step: { key: "b", place: "university-library" },
    });
    expect(stepPlace({ type: "pass-activity", ref: "x" })).toBeNull();
    expect(
      currentObjective({
        student: { status: "active" },
        missions: [{ ...MISSION, complete: true }],
      }),
    ).toBeNull();
  });
});
