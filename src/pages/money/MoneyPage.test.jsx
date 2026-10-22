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

const wallet = (overrides = {}) => ({
  currency: { name: "Campus Coins", symbol: "CC" },
  balance: 500,
  savings: 0,
  savingsGoal: null,
  weeklyBudget: null,
  energy: 80,
  maxEnergy: 100,
  allowance: { amount: 200, available: true, week: "2026-W43" },
  isSimulated: true,
  ...overrides,
});

function moneyApi(extra = {}) {
  return mockApi({
    "GET /auth/me": ok(SESSION),
    "GET /students/me": ok({ student: makeStudent() }),
    "GET /economy/wallet": ok({ wallet: wallet() }),
    "GET /economy/bills": ok({ bills: [] }),
    "GET /economy/wallet/budget": ok({
      budget: {
        week: "2026-W43",
        incomeThisWeek: 500,
        spentThisWeek: 40,
        income30d: 500,
        spent30d: 40,
        spendingByCategory30d: { food: 40 },
        weeklyBudget: null,
        budgetLeft: null,
        savings: 0,
        savingsGoal: null,
        goalPercent: null,
      },
    }),
    "GET /economy/wallet/transactions": ok({
      entries: [
        {
          id: "e1",
          amount: 500,
          balanceAfter: 500,
          account: "wallet",
          kind: "grant",
          category: "income",
          description: "Welcome money for your first days on campus",
          createdAt: new Date().toISOString(),
        },
      ],
      hasMore: false,
    }),
    ...extra,
  });
}

describe("money", () => {
  it("shows the balance, energy, allowance and transactions — with the fictional-currency notice", async () => {
    let claimed = false;
    const api = moneyApi({
      "GET /economy/wallet": () =>
        ok({
          wallet: wallet(
            claimed
              ? { balance: 700, allowance: { amount: 200, available: false } }
              : {},
          ),
        }),
      "POST /economy/wallet/allowance": () => {
        claimed = true;
        return ok({ wallet: wallet({ balance: 700 }) });
      },
    });
    renderWithProviders(<App />, { route: "/money" });
    expect(await screen.findByRole("heading", { name: /500/ })).toBeVisible();
    expect(screen.getByLabelText("Energy 80 of 100")).toBeInTheDocument();
    expect(
      await screen.findByText("Welcome money for your first days on campus"),
    ).toBeVisible();
    expect(
      screen.getByText(/can't be bought with real money or cashed out/),
    ).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Collect allowance" }),
    );
    expect(await screen.findByRole("heading", { name: /700/ })).toBeVisible();
    expect(
      api.mock.calls.some(
        ([url, o]) =>
          String(url).endsWith("/economy/wallet/allowance") &&
          o.method === "POST",
      ),
    ).toBe(true);
  });

  it("buying sends only the item, quantity and a request key — never a price", async () => {
    const api = moneyApi({
      "GET /economy/shop": ok({
        items: [
          {
            key: "meat-pie",
            name: "Meat pie",
            kind: "food",
            price: 40,
            wardrobe: false,
            effects: { energy: 20 },
            transferable: true,
            maxPerPurchase: 10,
            owned: 0,
          },
          {
            key: "laptop",
            name: "Laptop",
            kind: "tools",
            price: 2500,
            wardrobe: false,
            effects: {},
            transferable: false,
            maxPerPurchase: 1,
            owned: 0,
          },
        ],
      }),
      "POST /economy/purchases": [
        201,
        {
          status: "success",
          data: { duplicate: false, wallet: wallet({ balance: 420 }) },
        },
      ],
    });
    renderWithProviders(<App />, { route: "/money?tab=shop" });
    expect(
      await screen.findByRole("button", { name: "Buy Laptop" }),
    ).toBeDisabled(); // can't afford
    await userEvent.selectOptions(
      screen.getByLabelText("How many Meat pie"),
      "2",
    );
    expect(screen.getByText("80 CC")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Buy Meat pie" }));
    const post = api.mock.calls.find(
      ([url, o]) =>
        String(url).endsWith("/economy/purchases") && o.method === "POST",
    );
    const body = JSON.parse(post[1].body);
    expect(body).toMatchObject({ itemKey: "meat-pie", quantity: 2 });
    expect(body.requestKey).toMatch(/^[A-Za-z0-9_-]{8,}$/);
    expect(body).not.toHaveProperty("price");
  });

  it("hustles show what's missing, and a job is done with the shared task views", async () => {
    const api = moneyApi({
      "GET /economy/hustles": ok({
        hustles: [
          {
            key: "campus-errands",
            name: "Campus errands",
            description: "Run errands.",
            requires: [],
            consumes: [],
            energyCost: 15,
            basePay: 40,
            passPercent: 60,
            cooldownMinutes: 10,
            maxJobsPerDay: 6,
            jobsToday: 0,
            cooldownEndsAt: null,
            activeJobId: null,
            canAccept: true,
            blockers: [],
          },
          {
            key: "graphic-design",
            name: "Graphic design",
            description: "Design flyers.",
            requires: ["laptop"],
            consumes: [],
            energyCost: 20,
            basePay: 200,
            passPercent: 60,
            cooldownMinutes: 30,
            maxJobsPerDay: 4,
            jobsToday: 0,
            cooldownEndsAt: null,
            activeJobId: null,
            canAccept: false,
            blockers: ["Needs: laptop"],
          },
        ],
      }),
      "GET /economy/jobs": ok({ jobs: [] }),
      "POST /economy/hustles/campus-errands/jobs": [
        201,
        { status: "success", data: { job: { id: "job1" }, task: {} } },
      ],
      "GET /economy/jobs/job1": ok({
        job: {
          id: "job1",
          hustle: "campus-errands",
          hustleName: "Campus errands",
          status: "active",
          client: "Chidi (fictional), 200L",
          brief: "Photocopy run.",
          basePay: 40,
          passPercent: 60,
        },
        task: {
          type: "engine",
          engine: "ordering",
          view: {
            instructions: "Order it.",
            items: [
              { id: "copy", text: "Make copies" },
              { id: "collect", text: "Collect notes" },
            ],
          },
        },
        result: null,
        pay: 0,
      }),
      "POST /economy/jobs/job1/complete": ok({
        done: true,
        job: { id: "job1", status: "completed" },
        result: {
          score: 2,
          maxScore: 2,
          percent: 100,
          passed: true,
          feedback: [
            {
              id: "collect",
              correct: true,
              position: 1,
              text: "Collect notes",
            },
            { id: "copy", correct: true, position: 2, text: "Make copies" },
          ],
        },
        pay: 40,
        balance: 540,
      }),
    });
    renderWithProviders(<App />, { route: "/money?tab=hustles" });
    const design = (
      await screen.findByRole("heading", { name: "Graphic design" })
    ).closest("li");
    expect(within(design).getByText("Needs: laptop")).toBeVisible();
    expect(
      within(design).getByRole("button", { name: "Take a job" }),
    ).toBeDisabled();

    await userEvent.click(
      screen.getAllByRole("button", { name: "Take a job" })[0],
    );
    expect(
      await screen.findByRole("heading", { name: "Chidi (fictional), 200L" }),
    ).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: 'Move "Collect notes" up' }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Hand in the work" }),
    );
    expect(await screen.findByText("+40 CC earned")).toBeVisible();
    const post = api.mock.calls.find(([url]) =>
      String(url).endsWith("/economy/jobs/job1/complete"),
    );
    expect(JSON.parse(post[1].body)).toEqual({
      answer: { order: ["collect", "copy"] },
    });
  });
});
