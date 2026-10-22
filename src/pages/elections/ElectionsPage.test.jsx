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

const hours = (h) => new Date(Date.now() + h * 3_600_000).toISOString();
const SCHEDULE = {
  nominationsOpenAt: hours(-72),
  nominationsCloseAt: hours(-48),
  votingOpenAt: hours(-2),
  votingCloseAt: hours(22),
  disputesCloseAt: hours(46),
};
const SUMMARY = {
  id: "e1",
  cycle: "2026-10-21",
  title: "Class Representative",
  body: null,
  positionCode: "CR",
  scope: { type: "department", unitName: "Department of Computer Science" },
  seats: 1,
  votesPerVoter: 1,
  schedule: SCHEDULE,
  phase: "voting",
  candidates: 2,
  myCandidacy: null,
  hasVoted: false,
};
const CANDIDATES = [
  {
    id: "c1",
    status: "nominated",
    statusReason: null,
    playerId: "p2",
    displayName: "Tobi",
    username: "tobi",
    slogan: "Lectures on time",
    manifesto: { summary: "More tutorials.", points: ["Weekly study groups"] },
    poster: { color: "#1d4ed8", layout: "bold" },
    buzz: { endorsements: 12, volunteers: 3, activities: 2 },
  },
  {
    id: "c2",
    status: "nominated",
    statusReason: null,
    playerId: "p3",
    displayName: "Ngozi",
    username: "ngozi",
    slogan: null,
    manifesto: { points: [] },
    poster: { color: "#b91c1c", layout: "classic" },
    buzz: { endorsements: 40, volunteers: 9, activities: 5 },
  },
];
const detail = (over = {}) => ({
  election: {
    ...SUMMARY,
    rules: {
      tieBreak: "drawing-of-lots",
      campaign: { debateQuestions: ["How will you help freshers?"] },
    },
    lotSeedHash: "ab".repeat(32),
    cancellation: null,
    disputes: { open: 0, total: 0 },
    ...over.election,
  },
  candidates: CANDIDATES,
  campaign: [],
  me: {
    canVote: true,
    voteReasons: [],
    canStand: false,
    standReasons: [],
    gameStanding: 3.9,
    hasVoted: false,
    candidacy: null,
    support: [],
    ...over.me,
  },
  results: over.results ?? null,
});

function electionsApi(extra = {}) {
  return mockApi({
    "GET /auth/me": ok(SESSION),
    "GET /students/me": ok({ student: makeStudent() }),
    "GET /economy/wallet": ok({
      wallet: { balance: 500, currency: { symbol: "CC" } },
    }),
    "GET /elections": ok({ elections: [SUMMARY] }),
    "GET /elections/offices/me": ok({ offices: [] }),
    "GET /elections/e1": ok(detail()),
    ...extra,
  });
}

describe("student elections", () => {
  it("lists elections happening now and opens one", async () => {
    electionsApi();
    renderWithProviders(<App />, { route: "/elections" });
    expect(await screen.findByText("Happening now")).toBeVisible();
    expect(screen.getByText("Class Representative")).toBeVisible();
    expect(screen.getByText(/simulated game election/i)).toBeVisible();
    await userEvent.click(screen.getByRole("link", { name: "Vote" }));
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Class Representative",
      }),
    ).toBeVisible();
    expect(screen.getByText(/only votes decide the result/i)).toBeVisible();
  });

  it("votes once with a confirmation step and shows a private ballot code", async () => {
    const api = electionsApi({
      "POST /elections/e1/ballots": [
        201,
        { status: "success", data: { ballotCode: "f".repeat(32), choices: 1 } },
      ],
    });
    renderWithProviders(<App />, { route: "/elections/e1" });
    const ballot = await screen.findByRole("region", { name: "Your ballot" });
    await userEvent.click(within(ballot).getByLabelText(/Ngozi/));
    await userEvent.click(
      within(ballot).getByRole("button", { name: "Review my vote" }),
    );
    expect(within(ballot).getByText(/Vote for Ngozi\?/)).toBeVisible();
    await userEvent.click(
      within(ballot).getByRole("button", { name: "Cast my vote" }),
    );

    expect(await screen.findByText("f".repeat(32))).toBeVisible();
    const call = api.mock.calls.find(
      ([url, o]) =>
        String(url).endsWith("/elections/e1/ballots") && o.method === "POST",
    );
    expect(JSON.parse(call[1].body)).toEqual({ candidacyIds: ["c2"] });
  });

  it("explains why a player can't vote", async () => {
    electionsApi({
      "GET /elections/e1": ok(
        detail({
          me: {
            canVote: false,
            voteReasons: [
              "Only students of Department of Computer Science can vote.",
            ],
          },
        }),
      ),
    });
    renderWithProviders(<App />, { route: "/elections/e1" });
    expect(
      await screen.findByText(
        "Only students of Department of Computer Science can vote.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("region", { name: "Your ballot" })).toBeNull();
  });

  it("shows certified results with the tie-break and seed", async () => {
    electionsApi({
      "GET /elections/e1": ok(
        detail({
          election: { phase: "certified" },
          me: { hasVoted: true },
          results: {
            provisional: false,
            ballots: 4,
            eligibleVoters: 30,
            tallies: [
              { candidacy: "c2", displayName: "Ngozi", votes: 2 },
              { candidacy: "c1", displayName: "Tobi", votes: 2 },
            ],
            winners: ["c2"],
            tieBreak: {
              applied: true,
              method: "drawing-of-lots",
              seed: "cd".repeat(16),
              detail: "2 candidates tied on 2 vote(s) for the last seat",
            },
            hash: "ee".repeat(32),
            certifiedAt: hours(-1),
          },
        }),
      ),
    });
    renderWithProviders(<App />, { route: "/elections/e1" });
    const results = await screen.findByRole("region", {
      name: "Certified results",
    });
    expect(within(results).getByText(/Ngozi · elected ✓/)).toBeVisible();
    expect(within(results).getByText(/2 candidates tied/)).toBeVisible();
    expect(
      within(results).getByText(/4 ballots of 30 eligible voters/),
    ).toBeVisible();
    // voters can check their ballot
    expect(screen.getByText("Check my ballot was counted")).toBeVisible();
  });

  it("asks a not-yet-admitted player to get admitted", async () => {
    electionsApi({
      "GET /elections": fail(409, "NOT_ENROLLED"),
    });
    renderWithProviders(<App />, { route: "/elections" });
    expect(
      await screen.findByRole("link", { name: "Go to admission" }),
    ).toBeVisible();
  });
});

describe("leadership", () => {
  it("an office holder posts an announcement from their desk", async () => {
    const api = electionsApi({
      "GET /elections/offices/me": ok({
        offices: [
          {
            id: "o1",
            positionCode: "CR",
            title: "Class Representative",
            scope: {
              type: "department",
              unitName: "Department of Computer Science",
            },
            privileges: ["announce"],
            status: "active",
            startsAt: hours(-24),
            endsAt: hours(24 * 100),
            welfare: null,
          },
        ],
      }),
      "POST /elections/offices/o1/announcements": [
        201,
        { status: "success", data: { announcement: { id: "a1" } } },
      ],
    });
    renderWithProviders(<App />, { route: "/elections?tab=office" });
    expect(await screen.findByText("Post an announcement")).toBeVisible();
    expect(screen.queryByText("Welfare grant")).toBeNull(); // not this office's power
    await userEvent.type(screen.getByLabelText("Title"), "Tutorial on Friday");
    await userEvent.type(screen.getByLabelText("Message"), "LT1 at 4pm.");
    await userEvent.click(screen.getByRole("button", { name: "Announce" }));
    expect(await screen.findByText("Announcement sent.")).toBeVisible();
    const call = api.mock.calls.find(([url]) =>
      String(url).endsWith("/offices/o1/announcements"),
    );
    expect(JSON.parse(call[1].body)).toEqual({
      title: "Tutorial on Friday",
      body: "LT1 at 4pm.",
    });
  });
});
