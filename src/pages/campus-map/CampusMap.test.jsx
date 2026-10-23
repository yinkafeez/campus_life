import { afterEach, describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../../App";
import { renderWithProviders } from "../../test/renderWithProviders";
import { fail, makeStudent, mockApi, ok, SESSION } from "../../test/mockApi";
import { fakeSocket } from "../../test/fakeSocket";
import { useToastStore } from "../../stores/useToastStore";
import overview from "../../game/overview/unilagOverview";

afterEach(() => {
  fakeSocket.reset();
  useToastStore.setState({ toasts: [] });
});

describe("first time on campus", () => {
  it("creating an account opens the whole-campus map before admission", async () => {
    let created = false;
    mockApi({
      "GET /auth/me": () =>
        created ? ok(SESSION) : fail(401, "UNAUTHENTICATED"),
      "POST /auth/refresh": fail(401, "X"),
      "POST /auth/register": () => {
        created = true;
        return [201, { status: "success", data: SESSION }];
      },
      "GET /students/me": fail(404, "NO_STUDENT_RECORD"),
      "GET /campus/world": ok({
        university: null,
        world: null,
        locations: [],
        npcs: [],
        discoveries: [],
      }),
    });
    renderWithProviders(<App />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Create account" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Create account",
    });
    await userEvent.type(within(dialog).getByLabelText("Display name"), "Ada");
    await userEvent.type(within(dialog).getByLabelText("Username"), "ada_test");
    await userEvent.type(
      within(dialog).getByLabelText("Email"),
      "ada@example.test",
    );
    await userEvent.type(
      within(dialog).getByLabelText("Password"),
      "Jaja-hall-2026",
    );
    await userEvent.click(within(dialog).getByRole("checkbox"));
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Create player" }),
    );

    expect(
      await screen.findByRole("heading", { name: "This is your campus" }),
    ).toBeVisible();
    expect(
      await screen.findByTestId("campus-overview-map"),
    ).toBeInTheDocument();
    // not admitted yet: admission first, then the journey starts at the Main Gate
    expect(
      screen.getByRole("button", { name: "Apply for admission" }),
    ).toBeVisible();
    expect(screen.getAllByText(/starts at the Main Gate/).length).toBeGreaterThan(0);
  });

  it("an enrolled fresher starts their journey at the Main Gate", async () => {
    mockApi({
      "GET /auth/me": ok(SESSION),
      "GET /students/me": ok({
        student: makeStudent({ status: "matriculated" }),
      }),
      "GET /campus/world": ok({
        university: { slug: "unilag" },
        world: null,
        locations: [],
        npcs: [],
        discoveries: [],
      }),
    });
    renderWithProviders(<App />, { route: "/welcome" });
    expect(
      await screen.findByRole("button", { name: "Start at the Main Gate" }),
    ).toBeVisible();
  });
});

describe("the campus overview data", () => {
  it("names every place once and keeps every place on the map", () => {
    const slugs = overview.places.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const p of overview.places) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(overview.size.width / 2);
      expect(Math.abs(p.z)).toBeLessThanOrEqual(overview.size.depth / 2);
    }
    // every hall of residence has a signpost
    expect(
      overview.places.filter((p) => p.kind === "hall").length,
    ).toBeGreaterThanOrEqual(17);
    expect(slugs).toContain("main-gate");
  });
});

describe("stalites", () => {
  const STALITE = makeStudent({
    status: "matriculated",
    studentType: "stalite",
    onboarding: {
      steps: [
        {
          key: "choose-hostel",
          title: "Choose your hall of residence",
          kind: "hostel",
          completed: false,
        },
      ],
      completed: 0,
      total: 1,
    },
  });
  const HALLS = {
    studentType: "stalite",
    rules: {},
    hostels: [
      {
        slug: "king-jaja-hall",
        name: "King Jaja Hall",
        residentGender: "male",
        capacity: 480,
        bedsLeft: 480,
        eligible: true,
        problems: [],
        mode: "direct",
      },
      {
        slug: "queen-moremi-hall",
        name: "Queen Moremi Hall",
        residentGender: "female",
        capacity: 480,
        bedsLeft: 480,
        eligible: false,
        problems: ["This is a female hall."],
        mode: "direct",
      },
    ],
  };

  it("choose a hall from the list and go straight to it", async () => {
    mockApi({
      "GET /auth/me": ok({
        ...SESSION,
        player: { ...SESSION.player, gender: "male" },
      }),
      "GET /students/me": ok({ student: STALITE }),
      "GET /characters/me": ok({ character: { _id: "c1" } }),
      "GET /accommodation/hostels": ok(HALLS),
      "POST /accommodation/me": ok({ assignment: { status: "active" } }),
      "GET /accommodation/me": ok({
        assignment: { status: "active", hostel: { name: "King Jaja Hall" } },
      }),
    });
    renderWithProviders(<App />, { route: "/admission" });
    expect(
      await screen.findByRole("heading", { name: "Move-in day" }),
    ).toBeVisible();
    const tracker = screen.getByRole("list", { name: "Your fresher journey" });
    expect(within(tracker).getByText("Your hall")).toBeVisible();

    const halls = await screen.findByRole("radiogroup", {
      name: "Halls of residence",
    });
    expect(within(halls).getByText("This is a female hall.")).toBeVisible();
    await userEvent.click(within(halls).getByLabelText(/King Jaja Hall/));
    await userEvent.click(
      screen.getByRole("button", { name: "Move into King Jaja Hall" }),
    );
    expect(
      await screen.findByText("Your room is ready. Welcome home!"),
    ).toBeVisible();
  });
});
