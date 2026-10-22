import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../../App";
import { renderWithProviders } from "../../test/renderWithProviders";
import { fail, mockApi, ok, SESSION } from "../../test/mockApi";
import { setSlot } from "../../game/character/look";
import { dressBody } from "../../game/character/outfitParts";

const ITEMS = [
  {
    key: "hair-afro",
    name: "Afro",
    slot: "hair",
    meshKey: "hair-afro",
    colorable: false,
    isStarter: true,
  },
  {
    key: "hair-bun",
    name: "High bun",
    slot: "hair",
    meshKey: "hair-bun",
    colorable: false,
    isStarter: true,
  },
  {
    key: "tshirt",
    name: "T-shirt",
    slot: "top",
    meshKey: "top-tshirt",
    colorable: true,
    defaultColor: "#0e9356",
    isStarter: true,
  },
  {
    key: "jeans",
    name: "Jeans",
    slot: "bottom",
    meshKey: "bottom-trousers",
    colorable: true,
    defaultColor: "#1e3a5f",
    isStarter: true,
  },
  {
    key: "ankara-gown",
    name: "Ankara gown",
    slot: "fullbody",
    meshKey: "fullbody-gown",
    colorable: true,
    defaultColor: "#7c3aed",
    isStarter: true,
  },
  {
    key: "agbada",
    name: "Agbada",
    slot: "fullbody",
    meshKey: "fullbody-agbada",
    colorable: true,
    defaultColor: "#f4f1ea",
    isStarter: false,
  },
  {
    key: "sneakers",
    name: "Sneakers",
    slot: "shoes",
    meshKey: "shoes-sneakers",
    colorable: true,
    defaultColor: "#f4f1ea",
    isStarter: true,
  },
];

const WARDROBE = {
  items: ITEMS,
  owned: [],
  palettes: {
    skinTones: [
      { key: "tone-1", name: "Deep", hex: "#3b2219" },
      { key: "tone-2", name: "Rich", hex: "#4f2d1f" },
    ],
    hairColors: [{ key: "black", name: "Black", hex: "#151110" }],
    fabricColors: ["#0e9356", "#1e3a5f", "#7c3aed", "#f4f1ea"],
  },
  occasions: ["lecture", "matriculation", "party", "formal", "sports"],
  bodyTypes: ["slim", "average", "sturdy"],
  heightRange: { min: 0.9, max: 1.1 },
  starterLook: {
    top: { item: "tshirt", color: "#0e9356" },
    bottom: { item: "jeans", color: "#1e3a5f" },
    shoes: { item: "sneakers", color: "#f4f1ea" },
  },
};

describe("look helpers", () => {
  it("keeps full-body items and top/bottom mutually exclusive", () => {
    const start = WARDROBE.starterLook;
    const gown = setSlot(start, "fullbody", { item: "ankara-gown" });
    expect(gown.top).toBeUndefined();
    expect(gown.bottom).toBeUndefined();
    const back = setSlot(gown, "top", { item: "tshirt" });
    expect(back.fullbody).toBeUndefined();
  });

  it("paints body segments with the clothes covering them", () => {
    const itemsByKey = new Map(ITEMS.map((el) => [el.key, el]));
    const { segments, extras } = dressBody(
      {
        fullbody: { item: "ankara-gown", color: "#7c3aed" },
        shoes: { item: "sneakers" },
      },
      itemsByKey,
      { skin: "#4f2d1f" },
    );
    expect(segments.torso).toBe("#7c3aed");
    expect(segments.lowerArm).toBe("#4f2d1f"); // short sleeves
    expect(segments.feet).toBe("#f4f1ea"); // default colour
    expect(extras.map((el) => el.extra)).toEqual(["gown", "sole-white"]);
  });
});

describe("character creator", () => {
  it(
    "creates a character from the starter look, then offers to play",
    { timeout: 20_000 },
    async () => {
      let created = null;
      const api = mockApi({
        "GET /auth/me": ok(SESSION),
        "GET /wardrobe": () =>
          ok({
            ...WARDROBE,
            owned: created
              ? ITEMS.filter((el) => el.isStarter).map((el) => ({
                  itemKey: el.key,
                }))
              : [],
          }),
        "GET /characters/me": () =>
          created ? ok({ character: created }) : fail(404, "NO_CHARACTER"),
        "POST /characters/me": (body) => {
          created = { _id: "c1", ...body, outfits: [] };
          return [201, { status: "success", data: { character: created } }];
        },
      });
      renderWithProviders(<App />, { route: "/character" });

      expect(
        await screen.findByRole("heading", { name: "Create your character" }),
      ).toBeVisible();
      expect(
        await screen.findByTestId("character-preview"),
      ).toBeInTheDocument();

      // body tab: pick a skin tone and a hairstyle
      await userEvent.click(screen.getByRole("button", { name: "Deep" }));
      await userEvent.click(screen.getByRole("button", { name: "High bun" }));

      // clothes tab: the non-starter agbada is locked
      await userEvent.click(screen.getByRole("tab", { name: "Clothes" }));
      expect(screen.getByRole("button", { name: "Agbada" })).toBeDisabled();
      await userEvent.click(
        screen.getByRole("button", { name: "Ankara gown" }),
      );

      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(
        await screen.findByRole("heading", { name: "Wardrobe" }),
      ).toBeVisible();
      const post = api.mock.calls.find(
        ([url, opts]) =>
          String(url).endsWith("/characters/me") && opts.method === "POST",
      );
      const body = JSON.parse(post[1].body);
      expect(body.appearance).toMatchObject({
        skinTone: "tone-1",
        hairStyle: "hair-bun",
      });
      expect(body.equipped).toMatchObject({
        fullbody: { item: "ankara-gown" },
        shoes: { item: "sneakers" },
      });
      expect(body.equipped.top).toBeUndefined();
      expect(
        screen.getByRole("button", { name: "Enter campus" }),
      ).toBeVisible();
    },
  );
});

describe("play screen", () => {
  it("sends a player without a character to the creator", async () => {
    mockApi({
      "GET /auth/me": ok(SESSION),
      "GET /wardrobe": ok(WARDROBE),
      "GET /characters/me": fail(404, "NO_CHARACTER"),
    });
    renderWithProviders(<App />, { route: "/play" });
    expect(
      await screen.findByRole("heading", { name: "Create your character" }),
    ).toBeVisible();
  });

  it("enters the world with the HUD and outfit switcher", async () => {
    const character = {
      _id: "c1",
      appearance: {
        bodyType: "average",
        height: 1,
        skinTone: "tone-2",
        hairColor: "black",
        hairStyle: "hair-afro",
      },
      equipped: WARDROBE.starterLook,
      outfits: [{ occasion: "sports", slots: WARDROBE.starterLook }],
    };
    const api = mockApi({
      "GET /auth/me": ok(SESSION),
      "GET /wardrobe": ok({
        ...WARDROBE,
        owned: ITEMS.map((el) => ({ itemKey: el.key })),
      }),
      "GET /characters/me": ok({ character }),
      "POST /characters/me/outfits/sports/wear": ok({ character }),
    });
    renderWithProviders(<App />, { route: "/play" });

    expect(await screen.findByTestId("game-world")).toBeInTheDocument();
    expect(screen.getByText("Arrival Plaza")).toBeVisible();
    const outfits = screen.getByRole("navigation", { name: "Change outfit" });
    await userEvent.click(
      within(outfits).getByRole("button", { name: "Sports" }),
    );
    expect(
      api.mock.calls.some(
        ([url, opts]) =>
          String(url).endsWith("/outfits/sports/wear") &&
          opts.method === "POST",
      ),
    ).toBe(true);
  });
});
