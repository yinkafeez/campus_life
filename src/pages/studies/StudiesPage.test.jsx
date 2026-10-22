import { afterEach, describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../../App";
import { renderWithProviders } from "../../test/renderWithProviders";
import { fail, makeStudent, mockApi, ok, SESSION } from "../../test/mockApi";
import { fakeSocket } from "../../test/fakeSocket";
import { useToastStore } from "../../stores/useToastStore";

afterEach(() => {
  fakeSocket.reset();
  useToastStore.setState({ toasts: [] });
});

const DISCLAIMER =
  "Game activities are fictional practice made for Campus Life. Game XP and passes are not UNILAG grades, credits, examinations or academic records.";

function standing(overrides = {}) {
  return {
    isSimulated: true,
    disclaimer: DISCLAIMER,
    status: "active",
    level: { level: 100, label: "100L" },
    nextLevel: { level: 200, label: "200L" },
    isFinalLevel: false,
    levelXp: 120,
    totalXp: 120,
    passedAtLevel: 2,
    canAdvance: false,
    graduatedAt: null,
    requirements: [
      {
        key: "xp",
        label: "Earn 200 game XP at this level",
        have: 120,
        need: 200,
        done: false,
      },
      {
        key: "passed",
        label: "Pass 3 activities at this level",
        have: 2,
        need: 3,
        done: false,
      },
      {
        key: "onboarding",
        label: "Finish fresher onboarding",
        have: 1,
        need: 1,
        done: true,
      },
    ],
    history: [
      { level: 100, label: "100L", xp: 120, passed: 2, completedAt: null },
    ],
    ...overrides,
  };
}

const QUIZ_ACTIVITY = {
  key: "cs-predict-output",
  title: "Predict the output",
  summary: "Short JavaScript puzzles.",
  discipline: "Computing",
  engine: "quiz",
  format: "Quiz",
  difficulty: "easy",
  xp: 50,
  passPercent: 60,
  maxAttempts: 3,
  timeLimitSeconds: 600,
  location: null,
  notice: null,
  dueAt: null,
  opensAt: null,
  closesAt: null,
  state: {
    available: true,
    reason: null,
    late: false,
    attemptsUsed: 0,
    attemptsLeft: 3,
    openAttemptId: null,
    best: null,
  },
};

function studiesApi(extra = {}) {
  return mockApi({
    "GET /auth/me": ok(SESSION),
    "GET /students/me": ok({ student: makeStudent() }),
    "GET /learning/standing": ok({ standing: standing() }),
    ...extra,
  });
}

describe("studies hub", () => {
  it("shows the level, what it takes to move up, and the game-only disclaimer", async () => {
    studiesApi();
    renderWithProviders(<App />, { route: "/studies" });
    expect(
      await screen.findByRole("heading", { name: "Studies" }),
    ).toBeVisible();
    expect(screen.getByText("Earn 200 game XP at this level")).toBeVisible();
    expect(screen.getByText("120/200")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Move up to 200L" }),
    ).toBeDisabled();
    expect(screen.getByText(DISCLAIMER)).toBeVisible();
    expect(
      screen.getAllByRole("link", { name: "Studies" }).length,
    ).toBeGreaterThan(0); // nav
  });

  it("moves up a level when the rules are met", async () => {
    let moved = false;
    const api = studiesApi({
      "GET /learning/standing": () =>
        ok({
          standing: moved
            ? standing({
                level: { level: 200, label: "200L" },
                nextLevel: { level: 300, label: "300L" },
                levelXp: 0,
              })
            : standing({
                canAdvance: true,
                requirements: [
                  {
                    key: "xp",
                    label: "Earn 200 game XP at this level",
                    have: 200,
                    need: 200,
                    done: true,
                  },
                ],
              }),
        }),
      "POST /learning/progression/advance": () => {
        moved = true;
        return ok({
          promotion: {
            graduated: false,
            from: { level: 100, label: "100L" },
            to: { level: 200, label: "200L" },
            achievementsEarned: [],
          },
        });
      },
    });
    renderWithProviders(<App />, { route: "/studies" });
    await userEvent.click(
      await screen.findByRole("button", { name: "Move up to 200L" }),
    );
    expect(
      await screen.findByRole("button", { name: "Move up to 300L" }),
    ).toBeVisible();
    expect(screen.getByText("Welcome to 200L.")).toBeVisible();
    expect(
      api.mock.calls.some(
        ([url, o]) =>
          String(url).endsWith("/learning/progression/advance") &&
          o.method === "POST",
      ),
    ).toBe(true);
  });

  it("lists activities by discipline, and missions with their steps", async () => {
    studiesApi({
      "GET /learning/activities": ok({ activities: [QUIZ_ACTIVITY] }),
      "GET /learning/missions": ok({
        missions: [
          {
            key: "fresher-first-week",
            title: "Fresher's first week",
            summary: null,
            xp: 100,
            requiredForPromotion: true,
            perLevel: false,
            complete: false,
            ready: false,
            steps: [
              {
                key: "find-library",
                label: "Find the University Library",
                type: "discover-location",
                have: 1,
                need: 1,
                done: true,
              },
              {
                key: "research-skills",
                label: "Pass 'Library research skills'",
                type: "pass-activity",
                have: 0,
                need: 1,
                done: false,
              },
            ],
          },
        ],
      }),
    });
    renderWithProviders(<App />, { route: "/studies?tab=activities" });
    const link = await screen.findByRole("link", {
      name: /Predict the output/,
    });
    expect(link).toHaveAttribute(
      "href",
      "/studies/activities/cs-predict-output",
    );
    expect(screen.getByRole("heading", { name: "Computing" })).toBeVisible();

    await userEvent.click(screen.getByRole("tab", { name: "Missions" }));
    expect(await screen.findByText("Fresher's first week")).toBeVisible();
    expect(screen.getByText("Needed to move up")).toBeVisible();
    expect(screen.getAllByLabelText("Done")).toHaveLength(1);
  });

  it("sends players who aren't studying yet to admission", async () => {
    studiesApi({
      "GET /learning/standing": fail(
        409,
        "NOT_MATRICULATED",
        "Matriculate first.",
      ),
    });
    renderWithProviders(<App />, { route: "/studies" });
    expect(
      await screen.findByRole("link", { name: "Continue your admission" }),
    ).toBeVisible();
  });
});

describe("activity player", () => {
  const VIEW = {
    instructions: "What does each snippet print?",
    questions: [
      {
        id: "q1",
        prompt: "What is printed?",
        snippet: "console.log('5' + 3);",
        options: [
          { id: "a", text: "8" },
          { id: "b", text: "53" },
        ],
      },
      {
        id: "q2",
        prompt: "Pick one",
        snippet: null,
        options: [
          { id: "a", text: "Yes" },
          { id: "b", text: "No" },
        ],
      },
    ],
  };

  it("starts an attempt, answers, submits and shows the server's result", async () => {
    const api = studiesApi({
      "GET /learning/activities/cs-predict-output": ok({
        activity: QUIZ_ACTIVITY,
        attempts: [],
      }),
      "POST /learning/activities/cs-predict-output/attempts": [
        201,
        {
          status: "success",
          data: {
            attempt: {
              id: "att1",
              number: 1,
              expiresAt: new Date(Date.now() + 600_000).toISOString(),
            },
            view: VIEW,
            resumed: false,
          },
        },
      ],
      "POST /learning/attempts/att1/submit": ok({
        attempt: { id: "att1", status: "submitted" },
        result: {
          score: 2,
          maxScore: 2,
          percent: 100,
          passed: true,
          passPercent: 60,
          late: false,
          xpAwarded: 50,
          feedback: [
            {
              id: "q1",
              correct: true,
              chosen: "b",
              answer: "53",
              explanation: "String + number joins text.",
            },
            {
              id: "q2",
              correct: true,
              chosen: "a",
              answer: "Yes",
              explanation: null,
            },
          ],
        },
        missionsCompleted: [],
        achievementsEarned: [{ key: "first-pass", title: "First pass" }],
      }),
    });
    renderWithProviders(<App />, {
      route: "/studies/activities/cs-predict-output",
    });
    expect(
      await screen.findByRole("heading", { name: "Predict the output" }),
    ).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(await screen.findByText("console.log('5' + 3);")).toBeVisible();
    expect(screen.getByRole("timer")).toBeVisible();
    const submit = screen.getByRole("button", { name: "Submit" });
    expect(submit).toBeDisabled(); // every question must be answered
    await userEvent.click(screen.getByRole("radio", { name: "53" }));
    await userEvent.click(screen.getByRole("radio", { name: "Yes" }));
    await userEvent.click(submit);

    const result = await screen.findByRole("region", { name: "Result" });
    expect(within(result).getByText("Passed · 100%")).toBeVisible();
    expect(within(result).getByText("+50 game XP")).toBeVisible();
    expect(
      within(result).getByText("String + number joins text."),
    ).toBeVisible();
    expect(
      within(result).getByText("Achievement unlocked: First pass"),
    ).toBeVisible();

    const post = api.mock.calls.find(([url]) =>
      String(url).endsWith("/learning/attempts/att1/submit"),
    );
    expect(JSON.parse(post[1].body)).toEqual({
      answer: { answers: { q1: "b", q2: "a" } },
    });
  });

  it("ordering activities submit the arranged order", async () => {
    const ordering = {
      ...QUIZ_ACTIVITY,
      key: "med-primary-survey",
      title: "Primary survey",
      engine: "ordering",
      format: "Put in order",
      timeLimitSeconds: null,
    };
    const api = studiesApi({
      "GET /learning/activities/med-primary-survey": ok({
        activity: ordering,
        attempts: [],
      }),
      "POST /learning/activities/med-primary-survey/attempts": [
        201,
        {
          status: "success",
          data: {
            attempt: {
              id: "att2",
              number: 1,
              expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
            },
            view: {
              instructions: "Order it.",
              items: [
                { id: "breathing", text: "Breathing" },
                { id: "airway", text: "Airway" },
                { id: "circulation", text: "Circulation" },
              ],
            },
          },
        },
      ],
      "POST /learning/attempts/att2/submit": ok({
        attempt: { id: "att2" },
        result: {
          score: 3,
          maxScore: 3,
          percent: 100,
          passed: true,
          passPercent: 60,
          late: false,
          xpAwarded: 50,
          feedback: [],
          explanation: null,
        },
        missionsCompleted: [],
        achievementsEarned: [],
      }),
    });
    renderWithProviders(<App />, {
      route: "/studies/activities/med-primary-survey",
    });
    await userEvent.click(await screen.findByRole("button", { name: "Start" }));
    await userEvent.click(
      await screen.findByRole("button", { name: 'Move "Airway" up' }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await screen.findByRole("region", { name: "Result" });
    const post = api.mock.calls.find(([url]) =>
      String(url).endsWith("/learning/attempts/att2/submit"),
    );
    expect(JSON.parse(post[1].body)).toEqual({
      answer: { order: ["airway", "breathing", "circulation"] },
    });
  });
});
