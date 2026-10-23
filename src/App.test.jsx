import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { renderWithProviders } from "./test/renderWithProviders";
import { fail, makeStudent, mockApi, ok, SESSION } from "./test/mockApi";

const signedOut = {
  "GET /auth/me": fail(401, "UNAUTHENTICATED"),
  "POST /auth/refresh": fail(401, "INVALID_REFRESH"),
};
const signedIn = (student) => ({
  "GET /auth/me": ok(SESSION),
  "GET /students/me": student
    ? ok({ student })
    : fail(
        404,
        "NO_STUDENT_RECORD",
        "You have not applied to a university yet.",
      ),
});

describe("start screen", () => {
  it("a first-time visitor sees the campus and two buttons — no landing page", async () => {
    mockApi(signedOut);
    renderWithProviders(<App />);

    expect(
      await screen.findByRole("heading", { level: 1, name: /campus\s*life/i }),
    ).toBeVisible();
    expect(
      await screen.findByTestId("campus-overview-hero"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create account" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Log in" })).toBeVisible();
    // the forms only appear when asked for
    expect(screen.queryByLabelText("Email or username")).toBeNull();
  });

  it("each button opens its form in a pop-up, and they switch between each other", async () => {
    mockApi(signedOut);
    renderWithProviders(<App />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Log in" }),
    );
    const login = await screen.findByRole("dialog", { name: "Log in" });
    expect(within(login).getByLabelText("Email or username")).toBeVisible();
    await userEvent.click(
      within(login).getByRole("button", { name: "Create a player" }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Create account" }),
    ).toBeVisible();
  });

  it("validates the sign-in form before calling the API", async () => {
    const api = mockApi(signedOut);
    renderWithProviders(<App />, { route: "/login" });

    await userEvent.click(await screen.findByRole("button", { name: "Play" }));
    expect(
      await screen.findByText("Enter your email or username"),
    ).toBeVisible();
    expect(
      api.mock.calls.some(([url]) => String(url).includes("/auth/login")),
    ).toBe(false);
  });

  it("shows the safe server error on a wrong password", async () => {
    mockApi({
      ...signedOut,
      "POST /auth/login": fail(
        401,
        "INVALID_CREDENTIALS",
        "Incorrect email/username or password.",
      ),
    });
    renderWithProviders(<App />, { route: "/login" });

    await userEvent.type(
      await screen.findByLabelText("Email or username"),
      "ada_test",
    );
    await userEvent.type(screen.getByLabelText("Password"), "wrong-password-1");
    await userEvent.click(screen.getByRole("button", { name: "Play" }));

    expect(
      await screen.findByText(/incorrect email\/username or password/i),
    ).toBeVisible();
  });

  it("signs in and resumes at admission when the player has not applied yet", async () => {
    let signedInNow = false;
    mockApi({
      "GET /auth/me": () =>
        signedInNow ? ok(SESSION) : fail(401, "UNAUTHENTICATED"),
      "POST /auth/refresh": fail(401, "INVALID_REFRESH"),
      "POST /auth/login": () => {
        signedInNow = true;
        return ok(SESSION);
      },
      "GET /students/me": fail(404, "NO_STUDENT_RECORD"),
      "GET /universities": ok({
        universities: [
          { slug: "unilag", name: "University of Lagos", shortName: "UNILAG" },
        ],
      }),
    });
    renderWithProviders(<App />, { route: "/login" });

    await userEvent.type(
      await screen.findByLabelText("Email or username"),
      "ada_test",
    );
    await userEvent.type(
      screen.getByLabelText("Password"),
      "Lagoon-breeze-2026",
    );
    await userEvent.click(screen.getByRole("button", { name: "Play" }));

    expect(
      await screen.findByRole("heading", { name: "Apply for admission" }),
    ).toBeVisible();
    expect(
      await screen.findByRole("option", {
        name: "University of Lagos (UNILAG)",
      }),
    ).toBeInTheDocument();
  });

  it("a returning player sees where they left off and continues without signing in", async () => {
    window.localStorage.setItem(
      "campus-life:last-visit",
      JSON.stringify({
        path: "/notifications",
        zone: "unilag-main-gate",
        x: 1,
        z: 2,
        place: "Main Gate",
        name: "Ada",
      }),
    );
    mockApi({
      ...signedIn(makeStudent()),
      "GET /learning/standing": fail(500, "X"),
    });
    renderWithProviders(<App />);
    expect(await screen.findByTestId("zone-preview")).toHaveAttribute(
      "data-zone",
      "unilag-main-gate",
    );
    expect(screen.getByText(/You were at/)).toHaveTextContent("Main Gate");
    expect(screen.queryByRole("button", { name: "Log in" })).toBeNull();
    await userEvent.click(
      await screen.findByRole("button", { name: "Continue" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Notifications" }),
    ).toBeVisible();
  });

  it("when the session has ended, Continue asks to sign in, then goes back to the same place", async () => {
    window.localStorage.setItem(
      "campus-life:last-visit",
      JSON.stringify({
        path: "/settings",
        zone: "unilag-main-gate",
        place: "Main Gate",
      }),
    );
    let signedInNow = false;
    mockApi({
      "GET /auth/me": () =>
        signedInNow ? ok(SESSION) : fail(401, "UNAUTHENTICATED"),
      "POST /auth/refresh": fail(401, "INVALID_REFRESH"),
      "POST /auth/login": () => {
        signedInNow = true;
        return ok(SESSION);
      },
      "GET /students/me": ok({ student: makeStudent() }),
    });
    renderWithProviders(<App />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Continue" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Log in" });
    expect(within(dialog).getByText(/session ended/)).toBeVisible();
    await userEvent.type(
      within(dialog).getByLabelText("Email or username"),
      "ada_test",
    );
    await userEvent.type(
      within(dialog).getByLabelText("Password"),
      "Lagoon-breeze-2026",
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Play" }));
    expect(
      await screen.findByRole("heading", { name: "Settings" }),
    ).toBeVisible();
  });
});

describe("journey screens", () => {
  it("counts down the simulated review", async () => {
    const reviewCompletesAt = new Date(Date.now() + 8000).toISOString();
    mockApi(
      signedIn(
        makeStudent({
          status: "under_review",
          matric: null,
          admission: {
            appliedAt: new Date().toISOString(),
            reviewCompletesAt,
            secondsUntilDecision: 8,
          },
        }),
      ),
    );
    renderWithProviders(<App />, { route: "/admission" });

    expect(
      await screen.findByRole("heading", { name: /under review/i }),
    ).toBeVisible();
    expect(
      screen.getByRole("list", { name: "Your fresher journey" }),
    ).toBeVisible();
  });

  it("shows a watermarked offer letter with accept and decline", async () => {
    mockApi(signedIn(makeStudent({ status: "offered", matric: null })));
    renderWithProviders(<App />, { route: "/admission" });

    const letter = await screen.findByRole("article");
    expect(within(letter).getByText("GAME SIMULATION")).toBeInTheDocument();
    expect(
      within(letter).getByRole("button", { name: "Accept offer" }),
    ).toBeVisible();
    expect(
      within(letter).getByRole("button", { name: "Decline" }),
    ).toBeVisible();
  });

  it("matriculates and shows the fictional number on the game ID card", async () => {
    let student = makeStudent({ status: "accepted", matric: null });
    mockApi({
      ...signedIn(student),
      "GET /students/me": () => ok({ student }),
      "POST /students/me/matriculation": () => {
        student = makeStudent({ status: "matriculated" });
        return ok({ student });
      },
      // the look comes first (it is the ID card photo)
      "GET /characters/me": ok({ character: { _id: "c1" } }),
    });
    renderWithProviders(<App />, { route: "/admission" });

    await userEvent.click(
      await screen.findByRole("button", { name: "Matriculate" }),
    );

    const card = await screen.findByLabelText("Game student ID card");
    expect(within(card).getByText("CL-260701001")).toBeVisible();
    expect(
      within(card).getByText("Fictional game matric number"),
    ).toBeVisible();
    expect(within(card).getByText(/not official/i)).toBeVisible();
  });
});

describe("dashboard", () => {
  it("resumes an enrolled player at the dashboard (Continue with nothing remembered)", async () => {
    mockApi(signedIn(makeStudent()));
    renderWithProviders(<App />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Continue" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Hi, Ada" }),
    ).toBeVisible();
    expect(
      screen.getByText("Faculty of Computing and Informatics"),
    ).toBeVisible();
    expect(screen.getByText("Year 1 of 4")).toBeVisible();
    expect(screen.getByRole("link", { name: "Play" })).toHaveAttribute(
      "href",
      "/play",
    );
  });

  it("sends a player who hasn't finished onboarding back to admission", async () => {
    mockApi({ ...signedIn(makeStudent({ status: "matriculated" })) });
    renderWithProviders(<App />, { route: "/dashboard" });

    expect(
      await screen.findByRole("heading", { name: "Orientation week" }),
    ).toBeVisible();
  });

  it("guards game screens from signed-out visitors", async () => {
    mockApi(signedOut);
    renderWithProviders(<App />, { route: "/dashboard" });
    expect(await screen.findByRole("dialog", { name: "Log in" })).toBeVisible();
  });
});

describe("other screens", () => {
  it("shows API and database health on /status", async () => {
    mockApi({
      ...signedOut,
      "GET /health": ok({
        service: "campus-life-api",
        uptimeSeconds: 42,
        db: { state: "connected" },
      }),
    });
    renderWithProviders(<App />, { route: "/status" });

    expect(await screen.findByText("Online")).toBeVisible();
    expect(screen.getByText("connected")).toBeVisible();
  });

  it("shows the 404 screen for unknown URLs", async () => {
    mockApi(signedOut);
    renderWithProviders(<App />, { route: "/does-not-exist" });
    expect(await screen.findByText("404")).toBeVisible();
  });
});
