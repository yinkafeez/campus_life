import { describe, expect, it, vi } from "vitest";
import { api, ApiError, API_BASE_URL, request } from "./client";
import { jsonResponse } from "../test/renderWithProviders";

describe("api client", () => {
  it("calls /api/v1 with credentials and unwraps data", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        jsonResponse({ status: "success", data: { ok: true } }),
      );

    await expect(api.get("/health")).resolves.toEqual({ ok: true });

    const [url, options] = fetchMock.mock.calls[0];
    expect(API_BASE_URL).toBe("/api/v1");
    expect(url).toBe("/api/v1/health");
    expect(options.credentials).toBe("include");
    expect(options.method).toBe("GET");
  });

  it("sends JSON bodies", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        jsonResponse({ status: "success", data: { id: 1 } }, { status: 201 }),
      );

    await api.post("/things", { name: "Jaja" });

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers["Content-Type"]).toBe("application/json");
    expect(options.body).toBe('{"name":"Jaja"}');
  });

  it("resolves 204 to undefined", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 204 }),
    );
    await expect(api.delete("/things/1")).resolves.toBeUndefined();
  });

  it("turns the error envelope into an ApiError", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(
        {
          status: "fail",
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid input data.",
            details: [{ path: "x" }],
          },
          requestId: "req-123456",
        },
        { status: 400 },
      ),
    );

    const err = await request("/things").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      details: [{ path: "x" }],
      requestId: "req-123456",
    });
  });

  it("handles non-JSON error bodies", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html>Bad gateway</html>", {
        status: 502,
        statusText: "Bad Gateway",
      }),
    );
    const err = await request("/things").catch((e) => e);
    expect(err).toMatchObject({ status: 502, code: "HTTP_ERROR" });
  });

  it("reports network failures as NETWORK_ERROR (status 0)", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new TypeError("Failed to fetch"),
    );
    const err = await request("/things").catch((e) => e);
    expect(err).toMatchObject({ status: 0, code: "NETWORK_ERROR" });
  });
});

describe("session refresh", () => {
  it("refreshes once on a 401 and retries the original request", async () => {
    const calls = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options) => {
      calls.push(`${options.method} ${url}`);
      if (String(url).endsWith("/auth/refresh"))
        return jsonResponse({ status: "success", data: {} });
      // first try: expired token; after refresh: success
      return calls.filter((el) => el.endsWith("/students/me")).length === 1
        ? jsonResponse(
            { status: "fail", error: { code: "TOKEN_EXPIRED" } },
            { status: 401 },
          )
        : jsonResponse({
            status: "success",
            data: { student: { status: "active" } },
          });
    });

    await expect(api.get("/students/me")).resolves.toEqual({
      student: { status: "active" },
    });
    expect(calls).toEqual([
      "GET /api/v1/students/me",
      "POST /api/v1/auth/refresh",
      "GET /api/v1/students/me",
    ]);
  });

  it("shares one refresh between concurrent requests", async () => {
    let refreshes = 0;
    const seen = new Set();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).endsWith("/auth/refresh")) {
        refreshes += 1;
        return jsonResponse({ status: "success", data: {} });
      }
      if (!seen.has(url)) {
        seen.add(url);
        return jsonResponse(
          { status: "fail", error: { code: "TOKEN_EXPIRED" } },
          { status: 401 },
        );
      }
      return jsonResponse({ status: "success", data: { ok: url } });
    });

    await Promise.all([api.get("/a"), api.get("/b"), api.get("/c")]);
    expect(refreshes).toBe(1);
  });

  it("gives up after a failed refresh and never refreshes for login itself", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        jsonResponse(
          { status: "fail", error: { code: "INVALID_CREDENTIALS" } },
          { status: 401 },
        ),
      );

    const err = await api
      .post("/auth/login", { identifier: "x", password: "y" })
      .catch((e) => e);
    expect(err.code).toBe("INVALID_CREDENTIALS");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockClear();
    const protectedErr = await api.get("/auth/me").catch((e) => e);
    expect(protectedErr.status).toBe(401);
    // original + one refresh attempt, no retry loop
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
