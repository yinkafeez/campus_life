import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../../App";
import ErrorBoundary from "../../components/app/ErrorBoundary";
import { renderWithProviders } from "../../test/renderWithProviders";
import { fail, makeStudent, mockApi, ok, SESSION } from "../../test/mockApi";
import { fakeSocket } from "../../test/fakeSocket";
import { useToastStore } from "../../stores/useToastStore";

afterEach(() => {
  fakeSocket.reset();
  useToastStore.setState({ toasts: [] });
});

const signedIn = (extra = {}, session = SESSION) =>
  mockApi({
    "GET /auth/me": ok(session),
    "GET /students/me": ok({ student: makeStudent() }),
    ...extra,
  });
const bodyOf = (api, method, path) => {
  const call = api.mock.calls.find(
    ([url, o]) => String(url).endsWith(path) && o.method === method,
  );
  return call && JSON.parse(call[1].body);
};

describe("account & data rights", () => {
  it("changes the password", async () => {
    const api = signedIn({
      "PATCH /account/password": ok({ changed: true }),
    });
    renderWithProviders(<App />, { route: "/settings" });
    await userEvent.type(
      await screen.findByLabelText("Current password"),
      "Jaja-hall-2026",
    );
    await userEvent.type(
      screen.getByLabelText(/^New password/),
      "New-pass-2027",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Change password" }),
    );
    expect(
      await screen.findByText(/other devices were signed out/),
    ).toBeVisible();
    expect(bodyOf(api, "PATCH", "/account/password")).toEqual({
      currentPassword: "Jaja-hall-2026",
      newPassword: "New-pass-2027",
    });
  });

  it("shows a wrong current password clearly", async () => {
    signedIn({ "PATCH /account/password": fail(401, "WRONG_PASSWORD") });
    renderWithProviders(<App />, { route: "/settings" });
    await userEvent.type(
      await screen.findByLabelText("Current password"),
      "nope",
    );
    await userEvent.type(
      screen.getByLabelText(/^New password/),
      "New-pass-2027",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Change password" }),
    );
    expect(
      await screen.findByText("Your current password is incorrect."),
    ).toBeVisible();
  });

  it("deletes the account only after typing the confirmation, then signs out", async () => {
    const api = signedIn({ "DELETE /account": ok({ deleted: true }) });
    renderWithProviders(<App />, { route: "/settings" });
    const button = await screen.findByRole("button", {
      name: "Delete my account",
    });
    expect(button).toBeDisabled();
    const panel = button.closest("section") ?? document.body;
    await userEvent.type(
      within(panel).getByLabelText("Password"),
      "Jaja-hall-2026",
    );
    await userEvent.type(
      within(panel).getByLabelText(/to confirm/),
      "DELETE MY ACCOUNT",
    );
    expect(button).toBeEnabled();
    await userEvent.click(button);
    expect(
      await screen.findByRole("heading", { name: "Create your player" }),
    ).toBeVisible();
    expect(bodyOf(api, "DELETE", "/account")).toEqual({
      password: "Jaja-hall-2026",
      confirm: "DELETE MY ACCOUNT",
    });
  });

  it("the privacy notice is readable before signing up", async () => {
    mockApi({
      "GET /auth/me": fail(401, "UNAUTHENTICATED"),
      "POST /auth/refresh": fail(401, "X"),
    });
    renderWithProviders(<App />, { route: "/privacy" });
    expect(
      await screen.findByRole("heading", { name: "Privacy & game rules" }),
    ).toBeVisible();
    expect(screen.getByText(/Votes are secret/)).toBeVisible();
  });
});

describe("moderation", () => {
  const ADMIN = { ...SESSION, user: { ...SESSION.user, role: "admin" } };
  const REPORT = {
    _id: "r1",
    reason: "harassment",
    context: "chat",
    status: "open",
    createdAt: new Date().toISOString(),
    evidence: { text: "you are useless" },
    reporter: { playerId: "p2", displayName: "Tobi" },
    target: { playerId: "p3", displayName: "Rude", username: "rude" },
  };

  it("is only for admins", async () => {
    signedIn();
    renderWithProviders(<App />, { route: "/moderation" });
    expect(await screen.findByText(/for the game’s moderators/)).toBeVisible();
  });

  it("moderators see evidence and mute a player for a set time", async () => {
    const api = signedIn(
      {
        "GET /admin/reports?status=open": ok({ reports: [REPORT] }),
        "PATCH /admin/reports/r1": ok({
          report: { ...REPORT, status: "actioned" },
        }),
      },
      ADMIN,
    );
    renderWithProviders(<App />, { route: "/moderation" });
    expect(await screen.findByText("“you are useless”")).toBeVisible();
    await userEvent.selectOptions(screen.getByLabelText("Action"), "mute-chat");
    await userEvent.clear(screen.getByRole("spinbutton"));
    await userEvent.type(screen.getByRole("spinbutton"), "48");
    await userEvent.click(screen.getByRole("button", { name: "Resolve" }));
    expect(await screen.findByText("Report resolved.")).toBeVisible();
    expect(bodyOf(api, "PATCH", "/admin/reports/r1")).toEqual({
      action: "mute-chat",
      durationHours: 48,
    });
  });
});

describe("crashes", () => {
  it("a crashing screen shows a way back instead of a blank page", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const Boom = () => {
      throw new Error("boom");
    };
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(
      screen.getByRole("heading", { name: "Something went wrong" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Reload" })).toBeVisible();
  });
});
