import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
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

const card = (overrides) => ({
  playerId: "p2",
  username: "emeka",
  displayName: "Emeka",
  online: true,
  ...overrides,
});

function socialApi(extra = {}) {
  return mockApi({
    "GET /auth/me": ok(SESSION),
    "GET /students/me": ok({ student: makeStudent() }),
    "GET /social/friends": ok({
      friends: [card({ friendshipId: "f1" })],
      incoming: [
        card({
          playerId: "p3",
          username: "zainab",
          displayName: "Zainab",
          friendshipId: "f2",
          online: null,
        }),
      ],
      outgoing: [],
    }),
    "GET /messages/conversations": ok({ conversations: [] }),
    "GET /community/invitations": ok({ invitations: [] }),
    ...extra,
  });
}

describe("social hub", () => {
  it("shows friends and requests; accepting calls the API", async () => {
    const api = socialApi({
      "POST /social/friend-requests/f2/accept": ok({
        request: { _id: "f2", status: "accepted" },
      }),
    });
    renderWithProviders(<App />, { route: "/social" });
    expect(
      await screen.findByRole("heading", { name: "Campus social" }),
    ).toBeVisible();
    expect(await screen.findByRole("link", { name: "Emeka" })).toHaveAttribute(
      "href",
      "/players/emeka",
    );
    expect(screen.getByRole("tab", { name: /Friends/ })).toHaveTextContent("1"); // one request waiting

    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(
      api.mock.calls.some(
        ([url, o]) =>
          String(url).endsWith("/social/friend-requests/f2/accept") &&
          o.method === "POST",
      ),
    ).toBe(true);
  });

  it("searches players and sends a friend request", async () => {
    const api = socialApi({
      "GET /social/players?q=ad": ok({
        players: [
          card({
            playerId: "p9",
            username: "ada_lagos",
            displayName: "Ada L",
            online: false,
          }),
        ],
      }),
      "POST /social/friend-requests": [
        201,
        { status: "success", data: { request: { _id: "f9" } } },
      ],
    });
    renderWithProviders(<App />, { route: "/social" });
    await userEvent.type(
      await screen.findByLabelText("Search players by username"),
      "ad",
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Add friend" }),
    );
    const post = api.mock.calls.find(
      ([url, o]) =>
        String(url).endsWith("/social/friend-requests") && o.method === "POST",
    );
    expect(JSON.parse(post[1].body)).toEqual({ username: "ada_lagos" });
  });

  it("privacy settings save as you change them", async () => {
    const api = socialApi({
      "GET /social/privacy": ok({
        privacy: {
          profileVisibility: "everyone",
          messagesFrom: "friends",
          allowFriendRequests: true,
          showOnline: true,
          shareActivity: true,
        },
      }),
      "GET /social/relations": ok({
        blocked: [{ playerId: "p7", username: "troll", displayName: "Troll" }],
        muted: [],
      }),
      "PATCH /social/privacy": (body) =>
        ok({
          privacy: {
            profileVisibility: "everyone",
            messagesFrom: "friends",
            allowFriendRequests: true,
            showOnline: true,
            shareActivity: true,
            ...body,
          },
        }),
    });
    renderWithProviders(<App />, { route: "/social?tab=safety" });
    await userEvent.selectOptions(
      await screen.findByLabelText("Who can message me"),
      "nobody",
    );
    const patch = api.mock.calls.find(
      ([url, o]) =>
        String(url).endsWith("/social/privacy") && o.method === "PATCH",
    );
    expect(JSON.parse(patch[1].body)).toEqual({ messagesFrom: "nobody" });
    expect(await screen.findByText("Troll")).toBeVisible();
    expect(screen.getByRole("button", { name: "Unblock" })).toBeVisible();
  });
});

describe("player profile", () => {
  it("shows a public profile with friend, message, block and report actions", async () => {
    socialApi({
      "GET /social/players/emeka": ok({
        profile: {
          playerId: "p2",
          username: "emeka",
          displayName: "Emeka",
          online: true,
          relationship: "none",
          friendshipId: null,
          private: false,
          bio: "Engineering fresher. Jollof enthusiast.",
          university: { shortName: "UNILAG", name: "University of Lagos" },
          level: 100,
          canMessage: false,
        },
      }),
    });
    renderWithProviders(<App />, { route: "/players/emeka" });
    expect(await screen.findByRole("heading", { name: "Emeka" })).toBeVisible();
    expect(
      screen.getByText("Engineering fresher. Jollof enthusiast."),
    ).toBeVisible();
    expect(screen.getByText("simulated student")).toBeVisible();
    expect(screen.getByRole("button", { name: "Add friend" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Message" })).toBeNull(); // their privacy setting says no
    expect(screen.getByRole("button", { name: "Block" })).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Report player" }),
    );
    expect(screen.getByLabelText("What happened?")).toBeVisible();
  });

  it("a blocked or unknown player is just not found", async () => {
    socialApi({
      "GET /social/players/ghost": fail(
        404,
        "NOT_FOUND",
        "No player with that username.",
      ),
    });
    renderWithProviders(<App />, { route: "/players/ghost" });
    expect(await screen.findByRole("alert")).toBeVisible();
  });
});

describe("live notifications", () => {
  it("connects when signed in and shows a toast for a new message", async () => {
    socialApi();
    renderWithProviders(<App />, { route: "/social" });
    await screen.findByRole("heading", { name: "Campus social" });
    await vi.waitFor(() => expect(fakeSocket.connected).toBe(true));
    fakeSocket.serverEmit("message:new", {
      message: {
        id: "m1",
        conversation: "c1",
        sender: "p2",
        text: "You don chop?",
        createdAt: new Date().toISOString(),
      },
      from: { playerId: "p2", displayName: "Emeka" },
    });
    expect(await screen.findByText("You don chop?")).toBeVisible();
  });
});
