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
  it("opens the game on the sign-in screen when signed out (no landing page)", async () => {
    mockApi(signedOut);
    renderWithProviders(<App />);

    expect(
      await screen.findByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { level: 1, name: /campus\s*life/i }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Play" })).toBeVisible();
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

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /incorrect email\/username or password/i,
    );
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
    expect(screen.getByText(/game simulation\./i)).toBeVisible();
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
  it("resumes an enrolled player at the dashboard from /", async () => {
    mockApi(signedIn(makeStudent()));
    renderWithProviders(<App />);

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
    expect(
      await screen.findByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
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
