import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../../App";
import { renderWithProviders } from "../../test/renderWithProviders";
import { fail, makeStudent, mockApi, ok, SESSION } from "../../test/mockApi";

const HOSTELS = {
  rules: { allocationStrategy: "lottery", genderSeparated: true },
  hostels: [
    {
      slug: "ulws-hostel",
      name: "ULWS Hostel",
      residentGender: "female",
      mode: "direct",
      capacity: 120,
      bedsLeft: 118,
      eligible: true,
      problems: [],
      verification: { status: "verified" },
    },
    {
      slug: "king-jaja-hall",
      name: "King Jaja Hall",
      residentGender: "male",
      mode: "ballot",
      capacity: 480,
      bedsLeft: 480,
      eligible: false,
      problems: ["This is a male hall."],
      verification: { status: "verified" },
    },
  ],
};

function hostelApi(extra) {
  return mockApi({
    "GET /auth/me": ok(SESSION),
    "GET /students/me": ok({ student: makeStudent() }),
    "GET /accommodation/hostels": ok(HOSTELS),
    ...extra,
  });
}

describe("hostel page", () => {
  it("lists halls with eligibility and books a bed in a direct hall", async () => {
    let booked = false;
    const api = hostelApi({
      "GET /accommodation/me": () =>
        ok(
          booked
            ? {
                assignment: {
                  id: "a1",
                  status: "active",
                  via: "direct",
                  hostel: { name: "ULWS Hostel" },
                  room: 3,
                  bed: 2,
                  isSimulated: true,
                },
                roommates: [
                  {
                    playerId: "p5",
                    username: "kemi",
                    displayName: "Kemi",
                    bed: 1,
                  },
                ],
              }
            : { assignment: null, roommates: [] },
        ),
      "POST /accommodation/me": () => {
        booked = true;
        return [201, { status: "success", data: {} }];
      },
    });
    renderWithProviders(<App />, { route: "/hostel" });
    expect(
      await screen.findByRole("heading", { name: "Hostel" }),
    ).toBeVisible();
    expect(screen.getByText(/not a real hostel allocation/)).toBeVisible();
    const jaja = screen
      .getByRole("heading", { name: "King Jaja Hall" })
      .closest("article");
    expect(within(jaja).getByText("This is a male hall.")).toBeVisible();
    expect(within(jaja).queryByRole("button")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Book a bed" }));
    expect(await screen.findByText("Room 3 · Bed 2")).toBeVisible();
    expect(screen.getByRole("link", { name: "Kemi" })).toHaveAttribute(
      "href",
      "/players/kemi",
    );
    const post = api.mock.calls.find(
      ([url, o]) =>
        String(url).endsWith("/accommodation/me") && o.method === "POST",
    );
    expect(JSON.parse(post[1].body)).toEqual({ hostelSlug: "ulws-hostel" });
  });

  it("points players without a studentship to admission", async () => {
    hostelApi({
      "GET /accommodation/hostels": fail(
        409,
        "NOT_ENROLLED",
        "Enrol at a university first.",
      ),
      "GET /accommodation/me": fail(
        409,
        "NOT_ENROLLED",
        "Enrol at a university first.",
      ),
    });
    renderWithProviders(<App />, { route: "/hostel" });
    expect(
      await screen.findByRole("link", { name: "Continue your admission" }),
    ).toBeVisible();
  });
});
