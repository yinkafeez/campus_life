import { vi } from "vitest";
import { jsonResponse } from "./renderWithProviders";

/**
 * Route-based fetch mock: mockApi({ "GET /auth/me": [401, body], "POST /auth/login": [200, body] })
 * Paths are relative to /api/v1. A value may also be a function (body) → [status, body].
 * Unmatched requests answer 404. Returns the spy (calls are inspectable).
 */
export function mockApi(routes) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (url, options = {}) => {
      const path = String(url).replace(/^.*\/api\/v1/, "");
      const key = `${options.method ?? "GET"} ${path}`;
      const route = routes[key];
      if (!route)
        return jsonResponse(
          { status: "fail", error: { code: "NOT_FOUND" } },
          { status: 404 },
        );
      const [status, body] =
        typeof route === "function"
          ? route(options.body ? JSON.parse(options.body) : undefined)
          : route;
      return status === 204
        ? new Response(null, { status })
        : jsonResponse(body, { status });
    });
}

export const ok = (data) => [200, { status: "success", data }];
export const fail = (status, code, message = code) => [
  status,
  { status: status >= 500 ? "error" : "fail", error: { code, message } },
];

// a realistic signed-in session and student record for screens
export const SESSION = {
  user: {
    _id: "u1",
    username: "ada_test",
    email: "ada@example.test",
    role: "player",
  },
  player: { _id: "p1", displayName: "Ada", gender: "female", bio: "" },
};

export function makeStudent(overrides = {}) {
  return {
    studentId: "stu_00000000-0000-0000-0000-000000000000",
    status: "active",
    isSimulated: true,
    disclaimer: "Simulated game admission only. Not a real admission.",
    university: {
      slug: "unilag",
      name: "University of Lagos",
      shortName: "UNILAG",
    },
    faculty: { code: "CIN", name: "Faculty of Computing and Informatics" },
    department: { code: "CSC", name: "Department of Computer Science" },
    programme: {
      code: "CSC",
      name: "Computer Science",
      award: "B.Sc.",
      durationYears: 4,
    },
    entryLevel: { level: 100, label: "100L" },
    currentLevel: { level: 100, label: "100L" },
    session: { name: "2026/2027" },
    admission: {
      appliedAt: "2026-10-19T10:00:00.000Z",
      reviewCompletesAt: "2026-10-19T10:00:08.000Z",
      secondsUntilDecision: 0,
      offeredAt: "2026-10-19T10:00:08.000Z",
    },
    matric: {
      number: "CL-260701001",
      label: "Fictional game matric number",
      formatVersion: 1,
    },
    onboarding: {
      steps: [
        {
          key: "visit-library",
          title: "Visit the University Library",
          completed: true,
        },
      ],
      completed: 1,
      total: 1,
    },
    progress: {
      levels: [
        { level: 100, label: "100L", state: "current" },
        { level: 200, label: "200L", state: "upcoming" },
      ],
      yearOfStudy: 1,
      yearsTotal: 4,
      percent: 0,
    },
    ...overrides,
  };
}
