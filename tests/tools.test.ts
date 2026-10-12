import { describe, expect, it, vi } from "vitest";
import { CareerPilotApi } from "../src/careerpilot-api.js";
import { callCareerPilotTool } from "../src/tools.js";

describe("CareerPilot MCP tools", () => {
  it("lists resumes through the CareerPilot API", async () => {
    const api = { request: vi.fn().mockResolvedValue([{ id: "resume-1", title: "Software Engineer" }]) } as unknown as CareerPilotApi;
    const result = await callCareerPilotTool(api, "list_my_resumes", {});
    expect(api.request).toHaveBeenCalledWith("/resumes");
    expect(result.isError).toBe(false);
    expect(result.content[0]?.text).toContain("Software Engineer");
  });

  it("rejects invalid resume titles before calling the API", async () => {
    const api = { request: vi.fn() } as unknown as CareerPilotApi;
    await expect(callCareerPilotTool(api, "create_resume_draft", { title: "", data: {} })).rejects.toThrow();
    expect(api.request).not.toHaveBeenCalled();
  });

  it("does not call the API for unknown tools", async () => {
    const api = { request: vi.fn() } as unknown as CareerPilotApi;
    await expect(callCareerPilotTool(api, "send_bulk_email", {})).rejects.toThrow("Unknown CareerPilot tool");
    expect(api.request).not.toHaveBeenCalled();
  });
});
