import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup, configure } from "@testing-library/react";

// lazy screens are transformed on first use in tests — allow more than the 1s default
configure({ asyncUtilTimeout: 5000 });

// jsdom has no WebGL: the 3D backdrop is replaced by an empty element in tests
vi.mock("../game/backdrop/CampusBackdrop", () => ({ default: () => null }));
vi.mock("../game/GameWorld", () => ({
  default: () => <div data-testid="game-world" />,
}));
vi.mock("../game/CharacterPreview", () => ({
  default: () => <div data-testid="character-preview" />,
}));
vi.mock("../game/overview/CampusOverview", () => ({
  default: ({ mode }) => <div data-testid={`campus-overview-${mode}`} />,
}));
vi.mock("../game/overview/ZonePreview", () => ({
  default: ({ zone }) => (
    <div data-testid="zone-preview" data-zone={zone.key} />
  ),
}));

// no real Socket.IO server in tests: a fake socket that records what the app emits
vi.mock(
  "../lib/socket",
  async () => (await import("./fakeSocket")).socketModule,
);

afterEach(() => {
  cleanup();
  // each test starts as a first-time visitor on a fresh device
  window.localStorage.clear();
});
