import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../../App";
import { renderWithProviders } from "../../test/renderWithProviders";
import { makeStudent, mockApi, ok, SESSION } from "../../test/mockApi";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { CAMPUS_WORLD, CHARACTER, WARDROBE } from "../../test/campusFixtures";
import { fakeSocket } from "../../test/fakeSocket";
import { useCampusStore } from "../../game/state/useCampusStore";
import { useRemotePlayers } from "../../game/multiplayer/useRemotePlayers";
import NpcDialogue from "./NpcDialogue";
import LocationPanel from "./LocationPanel";

beforeEach(() => {
  useSettingsStore.setState({ briefingSeen: true });
});
afterEach(() => {
  fakeSocket.reset();
  useCampusStore.getState().reset();
  useRemotePlayers.getState().clear();
});

function playApi(extra = {}) {
  return mockApi({
    "GET /auth/me": ok(SESSION),
    "GET /wardrobe": ok(WARDROBE),
    "GET /characters/me": ok({ character: CHARACTER }),
    "GET /campus/world": ok(CAMPUS_WORLD),
    "PATCH /characters/me/position": ok({ character: CHARACTER }),
    ...extra,
  });
}

describe("play screen — UNILAG campus", () => {
  it("opens the university's start zone and joins it for presence", async () => {
    playApi();
    renderWithProviders(<App />, { route: "/play" });
    expect(
      await screen.findByText("UNILAG · Senate & Lagoon Front"),
    ).toBeVisible();
    expect(await screen.findByTestId("game-world")).toBeInTheDocument();
    // the realtime layer joined this zone
    await vi.waitFor(() =>
      expect(
        fakeSocket.emitted.some(
          ([event, p]) =>
            event === "zone:join" && p.zone === "unilag-senate-lagoon",
        ),
      ).toBe(true),
    );
  });

  it("map → directory → search → guide me shows the wayfinding HUD", async () => {
    playApi();
    renderWithProviders(<App />, { route: "/play" });
    await screen.findByText("UNILAG · Senate & Lagoon Front");

    await userEvent.click(
      screen.getByRole("button", { name: "Map and directory" }),
    );
    const map = await screen.findByRole("dialog", { name: "Campus map" });
    // undiscovered places are hidden on the map, discovered ones are named
    expect(
      within(map).getByRole("button", { name: "Undiscovered place" }),
    ).toBeInTheDocument();
    expect(
      within(map).getByRole("button", { name: "University Library" }),
    ).toBeInTheDocument();

    await userEvent.click(within(map).getByRole("tab", { name: "Directory" }));
    await userEvent.type(within(map).getByLabelText("Search places"), "2001");
    expect(within(map).getByText("2001 Cafeteria")).toBeVisible();
    expect(within(map).queryByText("University Library")).toBeNull();
    // real-world reference link only
    expect(
      within(map).getByRole("link", { name: "2001 Cafeteria on Google Maps" }),
    ).toHaveAttribute(
      "href",
      expect.stringMatching(/^https:\/\/www\.google\.com\/maps\/search\//),
    );

    await userEvent.click(
      within(map).getByRole("button", { name: /Guide me/ }),
    );
    expect(screen.queryByRole("dialog", { name: "Campus map" })).toBeNull();
    expect(await screen.findByText("Heading to")).toBeVisible();
    expect(screen.getByText(/2001 Cafeteria/)).toBeVisible();
    await vi.waitFor(() =>
      expect(useCampusStore.getState().route?.length).toBeGreaterThan(1),
    );
  });

  it("lists places not in the game yet in the directory", async () => {
    playApi();
    renderWithProviders(<App />, { route: "/play" });
    await screen.findByText("UNILAG · Senate & Lagoon Front");
    await userEvent.click(
      screen.getByRole("button", { name: "Map and directory" }),
    );
    await userEvent.click(screen.getByRole("tab", { name: "Directory" }));
    expect(screen.getByText("Faculty of Law")).toBeVisible();
    expect(screen.getByText("Coming to the game later")).toBeVisible();
  });

  it("zone chat sends through the socket and shows lines from the zone", async () => {
    playApi();
    fakeSocket.acks["chat:send"] = ({ text }) => ({
      ok: true,
      message: {
        id: "m1",
        from: { playerId: "p1", displayName: "Ada" },
        text,
        at: new Date().toISOString(),
      },
    });
    renderWithProviders(<App />, { route: "/play" });
    await screen.findByText("UNILAG · Senate & Lagoon Front");
    await userEvent.click(screen.getByRole("button", { name: "Zone chat" }));
    await userEvent.type(
      screen.getByLabelText("Chat message"),
      "How far everyone",
    );
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(fakeSocket.emitted).toContainEqual([
      "chat:send",
      { text: "How far everyone", range: "zone", clientId: expect.any(String) },
    ]);

    // "Nearby" only reaches players close to you
    await userEvent.click(screen.getByRole("radio", { name: "Nearby" }));
    await userEvent.type(screen.getByLabelText("Chat message"), "Psst");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(fakeSocket.emitted).toContainEqual([
      "chat:send",
      expect.objectContaining({ text: "Psst", range: "nearby" }),
    ]);

    // a line from someone else arrives
    useRemotePlayers.getState().addChat({
      id: "m2",
      from: { playerId: "p2", username: "emeka", displayName: "Emeka" },
      text: "Welcome! 2001 is on your right",
      at: new Date().toISOString(),
    });
    expect(
      await screen.findByText("Welcome! 2001 is on your right"),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Emeka" })).toHaveAttribute(
      "href",
      "/players/emeka",
    );
    expect(
      screen.getByRole("button", { name: "Report this message" }),
    ).toBeInTheDocument();
  });
});

describe("NPC dialogue", () => {
  const npc = CAMPUS_WORLD.npcs[0];
  const places = CAMPUS_WORLD.locations.filter((el) => el.world);

  it("walks the dialogue tree and ends", async () => {
    const onClose = vi.fn();
    renderWithProviders(
      <NpcDialogue
        npc={npc}
        places={places}
        onGuide={vi.fn()}
        onClose={onClose}
      />,
    );
    expect(screen.getByText("Fresher! Welcome to Akoka.")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Any tips?" }));
    expect(screen.getByText("Carry your ID card everywhere.")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Noted" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("gives directions to a chosen place", async () => {
    const onGuide = vi.fn();
    renderWithProviders(
      <NpcDialogue
        npc={npc}
        places={places}
        onGuide={onGuide}
        onClose={vi.fn()}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Show me the way somewhere" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "2001 Cafeteria" }),
    );
    expect(onGuide).toHaveBeenCalledWith("2001-cafeteria");
    expect(screen.getByText("Fictional character.")).toBeInTheDocument();
  });
});

describe("location panel", () => {
  it("shows the place, flags unconfirmed details and runs an activity", async () => {
    const api = mockApi({
      "POST /campus/activities": ok({
        activity: { key: "buy-jollof" },
        message: "You buy a hot plate of jollof.",
      }),
    });
    const place = CAMPUS_WORLD.locations[0];
    renderWithProviders(<LocationPanel location={place} onClose={vi.fn()} />);
    expect(
      screen.getByRole("heading", { name: "2001 Cafeteria" }),
    ).toBeVisible();
    expect(
      screen.getByText(/not confirmed yet — Opening hours not confirmed/),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: /Google Maps/ })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Buy jollof rice" }),
    );
    const call = api.mock.calls.find(([url]) =>
      String(url).endsWith("/campus/activities"),
    );
    expect(JSON.parse(call[1].body)).toEqual({
      locationSlug: "2001-cafeteria",
      activityKey: "buy-jollof",
    });
  });
});

describe("fresher journey on campus", () => {
  const steps = (libraryDone) => ({
    steps: [
      {
        key: "visit-library",
        title: "Visit the University Library",
        location: "university-library",
        completed: libraryDone,
      },
      {
        key: "first-meal",
        title: "Grab your first meal",
        location: "2001-cafeteria",
        completed: false,
      },
    ],
    completed: libraryDone ? 1 : 0,
    total: 2,
  });

  it("shows the briefing once, pins the objective, and ticks a step on arrival", async () => {
    useSettingsStore.setState({ briefingSeen: false });
    const completed = [];
    playApi({
      // standing at the library when the world loads
      "GET /characters/me": ok({
        character: {
          ...CHARACTER,
          lastPosition: {
            zone: "unilag-senate-lagoon",
            x: -22,
            z: 18,
            rotY: 0,
          },
        },
      }),
      "GET /students/me": ok({
        student: makeStudent({
          status: "matriculated",
          onboarding: steps(false),
        }),
      }),
      "POST /campus/discoveries": ok({
        discovery: { locationSlug: "university-library" },
        isNew: false,
      }),
      "POST /students/me/onboarding/visit-library": () => {
        completed.push("visit-library");
        return ok({
          student: makeStudent({
            status: "matriculated",
            onboarding: steps(true),
          }),
        });
      },
    });
    renderWithProviders(<App />, { route: "/play" });

    // first visit: the orientation briefing
    const briefing = await screen.findByRole("dialog", {
      name: "Orientation briefing",
    });
    for (let i = 0; i < 4; i += 1)
      await userEvent.click(
        within(briefing).getByRole("button", { name: "Next" }),
      );
    await userEvent.click(
      within(briefing).getByRole("button", { name: "Start exploring" }),
    );
    expect(
      screen.queryByRole("dialog", { name: "Orientation briefing" }),
    ).toBeNull();
    expect(useSettingsStore.getState().briefingSeen).toBe(true);

    // arriving at the library completes that step (the server verifies the visit)
    await vi.waitFor(() => expect(completed).toEqual(["visit-library"]), {
      timeout: 3000,
    });
    const hud = await screen.findByRole("complementary", {
      name: "Current objective",
    });
    expect(await within(hud).findByText("Orientation · 1/2")).toBeVisible();
    expect(within(hud).getByText("Grab your first meal")).toBeVisible();
    await userEvent.click(
      within(hud).getByRole("button", { name: /Guide me/ }),
    );
    expect(useCampusStore.getState().destination).toBe("2001-cafeteria");
  });

  it("the phone menu reaches every screen without leaving the world first", async () => {
    playApi();
    renderWithProviders(<App />, { route: "/play" });
    await screen.findByText("UNILAG · Senate & Lagoon Front");
    await userEvent.click(screen.getByRole("button", { name: /Phone/ }));
    const phone = screen.getByRole("dialog", { name: "Phone" });
    for (const name of [
      "Friends",
      "Messages",
      "Inventory",
      "Competitions",
      "Wardrobe",
      "Profile",
    ])
      expect(within(phone).getByRole("link", { name })).toBeVisible();
    await userEvent.click(within(phone).getByRole("button", { name: "Map" }));
    expect(
      await screen.findByRole("dialog", { name: "Campus map" }),
    ).toBeVisible();
  });
});
