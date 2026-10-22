import { afterEach, describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../../App";
import { renderWithProviders } from "../../test/renderWithProviders";
import { fail, makeStudent, mockApi, ok, SESSION } from "../../test/mockApi";
import { fakeSocket } from "../../test/fakeSocket";
import { useNotificationStore } from "../../stores/useNotificationStore";
import { notify } from "../../stores/useNotificationStore";
import { useToastStore } from "../../stores/useToastStore";

afterEach(() => {
  fakeSocket.reset();
  useToastStore.setState({ toasts: [] });
  useNotificationStore.getState().clear();
});

const ORIENTATION = {
  steps: [
    {
      key: "collect-id-card",
      title: "Collect your game student ID card",
      location: "senate-house",
      completed: true,
    },
    {
      key: "visit-library",
      title: "Visit the University Library",
      location: "university-library",
      completed: false,
    },
    {
      key: "read-handbook",
      title: "Read the student handbook",
      completed: false,
    },
  ],
  completed: 1,
  total: 3,
};

function journeyApi(student, extra = {}) {
  return mockApi({
    "GET /auth/me": ok(SESSION),
    "GET /students/me": ok({ student }),
    "GET /characters/me": fail(404, "NO_CHARACTER"),
    "GET /campus/world": ok({
      university: { shortName: "UNILAG" },
      world: null,
      locations: [{ slug: "university-library", name: "University Library" }],
      npcs: [],
      discoveries: [],
    }),
    ...extra,
  });
}

describe("fresher journey", () => {
  it("asks for a character before matriculation, then comes back here", async () => {
    journeyApi(makeStudent({ status: "accepted", matric: null }));
    renderWithProviders(<App />, { route: "/admission" });

    expect(
      await screen.findByRole("heading", { name: "Create your look" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: /Create my character/ }),
    ).toHaveAttribute("href", "/character?next=/admission");
    expect(screen.queryByRole("button", { name: "Matriculate" })).toBeNull();
    // the tracker shows where we are in the 7-stage journey
    const tracker = screen.getByRole("list", { name: "Your fresher journey" });
    expect(
      within(tracker).getByText("Your look").closest("li"),
    ).toHaveAttribute("aria-current", "step");
  });

  it("orientation is walked on campus: place steps link to the 3D world with a guide", async () => {
    journeyApi(
      makeStudent({ status: "matriculated", onboarding: ORIENTATION }),
    );
    renderWithProviders(<App />, { route: "/admission" });

    expect(
      await screen.findByRole("heading", { name: "Orientation week" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Start orientation on campus" }),
    ).toHaveAttribute("href", "/play?guide=university-library");
    // the place's real name, and a guide link instead of a fake "Done"
    expect(await screen.findByText("University Library")).toBeVisible();
    expect(screen.getByRole("link", { name: "Guide me" })).toHaveAttribute(
      "href",
      "/play?guide=university-library",
    );
    // a step without a place can still be ticked here
    expect(screen.getByRole("button", { name: "Done" })).toBeVisible();
  });
});

describe("navigation and notifications", () => {
  it("phones get a bottom bar; More opens every destination", async () => {
    journeyApi(makeStudent(), {
      "GET /economy/wallet": ok({
        wallet: { balance: 300, currency: { symbol: "CC" } },
      }),
    });
    renderWithProviders(<App />, { route: "/dashboard" });
    const bar = await screen.findByRole("navigation", { name: "Main" });
    expect(within(bar).getByRole("link", { name: "Campus" })).toHaveAttribute(
      "href",
      "/play",
    );
    await userEvent.click(within(bar).getByRole("button", { name: "More" }));
    const sheet = screen.getByRole("dialog", { name: "Go to" });
    for (const name of [
      "Inventory",
      "Messages",
      "Missions",
      "Competitions",
      "Elections",
      "Settings",
    ])
      expect(within(sheet).getByRole("link", { name })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Go to" })).toBeNull();
  });

  it("keeps toasts in the notification centre with links", async () => {
    journeyApi(makeStudent());
    renderWithProviders(<App />, { route: "/settings" });
    await screen.findByRole("heading", { name: "Settings" });
    notify({
      title: "Friend request",
      text: "Tobi wants to be your friend.",
      link: "/social",
    });
    const bell = await screen.findByRole("button", {
      name: "Notifications, 1 new",
    });
    await userEvent.click(bell);
    const panel = screen.getByRole("dialog", { name: "Notifications" });
    expect(
      within(panel).getByRole("link", { name: /Tobi wants to be your friend/ }),
    ).toHaveAttribute("href", "/social");
  });

  it("settings change the graphics quality for this device", async () => {
    journeyApi(makeStudent());
    renderWithProviders(<App />, { route: "/settings" });
    await userEvent.click(
      await screen.findByRole("radio", { name: /Battery saver/ }),
    );
    expect(screen.getByRole("radio", { name: /Battery saver/ })).toBeChecked();
  });
});
