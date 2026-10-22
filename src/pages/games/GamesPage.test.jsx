import { afterEach, describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../../App";
import { renderWithProviders } from "../../test/renderWithProviders";
import { makeStudent, mockApi, ok, SESSION } from "../../test/mockApi";
import { fakeSocket } from "../../test/fakeSocket";
import { useToastStore } from "../../stores/useToastStore";

afterEach(() => {
  fakeSocket.reset();
  useToastStore.setState({ toasts: [] });
});

const GAMES = [
  {
    key: "trivia",
    name: "Campus trivia",
    sport: "Trivia",
    scope: "7 questions, 120 seconds.",
    modes: ["solo", "duel"],
    implemented: true,
    available: true,
    stats: null,
  },
  {
    key: "penalties",
    name: "Penalty shootout",
    sport: "Football",
    scope: "Five penalties.",
    modes: ["solo", "duel"],
    implemented: true,
    available: true,
    stats: null,
  },
  {
    key: "chess",
    name: "Chess",
    sport: "Chess",
    scope: "Correspondence games validated on the server.",
    implemented: false,
    modes: [],
    available: false,
    stats: null,
  },
];
const soon = () => new Date(Date.now() + 120_000).toISOString();

function gamesApi(extra = {}) {
  return mockApi({
    "GET /auth/me": ok(SESSION),
    "GET /students/me": ok({ student: makeStudent() }),
    "GET /games": ok({ games: GAMES }),
    ...extra,
  });
}

describe("games hub", () => {
  it("lists playable games and honest 'coming later' ones", async () => {
    gamesApi();
    renderWithProviders(<App />, { route: "/games" });
    expect(
      await screen.findByRole("heading", { name: "Games & sports" }),
    ).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Play solo" })).toHaveLength(
      2,
    );
    expect(screen.getByText("Coming later")).toBeVisible();
    expect(
      screen.getByText("Correspondence games validated on the server."),
    ).toBeVisible();
  });

  it(
    "plays trivia: start → answer → server result",
    { timeout: 20_000 },
    async () => {
      const view = {
        questions: [
          {
            id: "ng-capital",
            category: "Nigeria",
            prompt: "What is the capital of Nigeria?",
            options: [
              { id: "a", text: "Abuja" },
              { id: "b", text: "Lagos" },
            ],
          },
        ],
      };
      const api = gamesApi({
        "POST /games/sessions": [
          201,
          {
            status: "success",
            data: {
              session: {
                id: "s1",
                type: "trivia",
                mode: "solo",
                status: "started",
                expiresAt: soon(),
              },
              view,
              timeLimitSeconds: 120,
            },
          },
        ],
        "POST /games/sessions/s1/submit": ok({
          session: {
            id: "s1",
            type: "trivia",
            mode: "solo",
            status: "finished",
            coins: 13,
          },
          result: {
            score: 390,
            max: 300,
            perfect: true,
            correct: 1,
            total: 1,
            details: [{ id: "ng-capital", correct: true, answer: "Abuja" }],
          },
          duel: null,
          achievementsEarned: [{ key: "first-game", title: "Game on" }],
        }),
      });
      renderWithProviders(<App />, { route: "/games" });
      await userEvent.click(
        (await screen.findAllByRole("button", { name: "Play solo" }))[0],
      );
      expect(
        await screen.findByText("What is the capital of Nigeria?", {
          exact: false,
        }),
      ).toBeVisible();
      expect(screen.getByRole("timer")).toBeVisible();
      await userEvent.click(screen.getByRole("radio", { name: "Abuja" }));
      await userEvent.click(
        screen.getByRole("button", { name: "Submit answers" }),
      );
      expect(await screen.findByText("390 points (1/1 correct)")).toBeVisible();
      expect(
        within(screen.getByRole("region", { name: "Result" })).getByText(
          "+13 CC",
        ),
      ).toBeVisible();
      const post = api.mock.calls.find(([url]) =>
        String(url).endsWith("/games/sessions/s1/submit"),
      );
      expect(JSON.parse(post[1].body)).toEqual({
        answer: { answers: { "ng-capital": "a" } },
      });
    },
  );

  it(
    "penalties: pick a spot for each kick, then shoot",
    { timeout: 20_000 },
    async () => {
      const api = gamesApi({
        "POST /games/sessions": [
          201,
          {
            status: "success",
            data: {
              session: {
                id: "s2",
                type: "penalties",
                mode: "solo",
                status: "started",
                expiresAt: soon(),
              },
              view: {
                kicks: 5,
                directions: ["left", "centre", "right"],
                heights: ["low", "high"],
              },
              timeLimitSeconds: 180,
            },
          },
        ],
        "POST /games/sessions/s2/submit": ok({
          session: {
            id: "s2",
            type: "penalties",
            mode: "solo",
            status: "finished",
            coins: 12,
          },
          result: {
            score: 3,
            max: 5,
            perfect: false,
            goals: 3,
            details: [
              {
                kick: 1,
                direction: "left",
                height: "low",
                keeper: "right",
                outcome: "goal",
              },
            ],
          },
          duel: null,
          achievementsEarned: [],
        }),
      });
      renderWithProviders(<App />, { route: "/games" });
      await userEvent.click(
        (await screen.findAllByRole("button", { name: "Play solo" }))[1],
      );
      const shoot = await screen.findByRole("button", {
        name: "Take the penalties",
      });
      expect(shoot).toBeDisabled();
      for (let i = 1; i <= 5; i += 1) {
        await userEvent.click(
          screen.getByRole("button", { name: `Penalty ${i}: high right` }),
        );
      }
      await userEvent.click(shoot);
      expect(await screen.findByText("3 / 5 goals")).toBeVisible();
      const post = api.mock.calls.find(([url]) =>
        String(url).endsWith("/games/sessions/s2/submit"),
      );
      expect(JSON.parse(post[1].body).answer.kicks).toHaveLength(5);
      expect(JSON.parse(post[1].body).answer.kicks[0]).toEqual({
        direction: "right",
        height: "high",
      });
    },
  );

  it("campus events show live competitions with prizes and standings", async () => {
    gamesApi({
      "GET /games/competitions": ok({
        competitions: [
          {
            id: "c1",
            title: "Friday Trivia Night",
            type: "trivia",
            teams: "solo",
            teamSize: 3,
            maxAttempts: 3,
            startsAt: new Date(Date.now() - 60_000).toISOString(),
            endsAt: new Date(Date.now() + 3_600_000).toISOString(),
            phase: "live",
            rewards: [{ rank: 1, coins: 300 }],
            myEntry: null,
            standings: [{ rank: 1, displayName: "Emeka", score: 820 }],
          },
        ],
      }),
      "GET /community/groups": ok({ groups: [] }),
    });
    renderWithProviders(<App />, { route: "/games?tab=events" });
    expect(
      await screen.findByRole("heading", { name: "Friday Trivia Night" }),
    ).toBeVisible();
    expect(screen.getByText("live")).toBeVisible();
    expect(screen.getByText(/#1 300 CC/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Play now" })).toBeEnabled();
    expect(screen.getByText("Emeka")).toBeVisible();
  });
});
