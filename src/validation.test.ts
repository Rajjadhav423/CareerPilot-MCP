import { describe, expect, it } from "vitest";
import { emailContent, id, jobInput, resumeInput } from "./tools.js";

describe("MCP input schemas", () => {
  it("rejects malformed ownership ids and invalid job input", () => {
    expect(id.safeParse("not-an-id").success).toBe(false);
    expect(jobInput.safeParse({ title: "", company: "Acme" }).success).toBe(false);
    expect(jobInput.safeParse({ title: "Engineer", company: "Acme", jobUrl: "javascript:alert(1)" }).success).toBe(false);
  });

  it("requires valid email content and preserves the backend's attachment choices", () => {
    expect(emailContent.safeParse({ to: "invalid", subject: "Hi", body: "Body" }).success).toBe(false);
    const result = emailContent.safeParse({
      to: "hr@example.com",
      subject: "Application",
      body: "Hello",
      resumeId: "00000000-0000-0000-0000-000000000001",
    });
    expect(result.success).toBe(true);
  });

  it("allows backend resume documents to apply the existing canonical validation", () => {
    expect(resumeInput.safeParse({ title: "Draft", data: { basics: {} } }).success).toBe(true);
    expect(resumeInput.safeParse({ title: "" }).success).toBe(false);
  });
});
