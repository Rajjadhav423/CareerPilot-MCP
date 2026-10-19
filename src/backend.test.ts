import { describe, expect, it, vi } from "vitest";
import { BackendError, createBackendClient } from "./backend.js";

describe("backend client", () => {
  it("forwards the user bearer token and parses JSON", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response('{"ok":true}', {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    const client = createBackendClient("http://backend.test", 1000, "user-token");
    await expect(client.request("/jobs")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith("http://backend.test/api/v1/jobs", expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer user-token" }),
    }));
    fetchMock.mockRestore();
  });

  it("passes the backend's problem detail and field errors through", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(
      '{"status":400,"detail":"Validation failed.","errors":{"data.basics.email":"must be an email address"}}',
      { status: 400, headers: { "content-type": "application/problem+json" } },
    ));
    await expect(createBackendClient("http://backend.test", 1000, "token").request("/resumes/document"))
      .rejects.toEqual(expect.objectContaining({ status: 400, message: "Validation failed.\n- data.basics.email: must be an email address" }));
    vi.restoreAllMocks();
  });

  it("sanitizes unavailable and timeout failures into typed backend errors", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("private network detail"));
    await expect(createBackendClient("http://backend.test", 1000, "token").request("/health"))
      .rejects.toEqual(expect.objectContaining<Partial<BackendError>>({ status: 502, message: "CareerPilot backend is unavailable." }));
    vi.restoreAllMocks();
  });
});
