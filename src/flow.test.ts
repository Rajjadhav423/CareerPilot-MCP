import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./tools.js";

const RESUME = "11111111-1111-4111-8111-111111111111";
const JOB = "22222222-2222-4222-8222-222222222222";
const AI_RESUME = "33333333-3333-4333-8333-333333333333";
const resumeData = { sections: [{ id: "s1", type: "entries", entries: [{ id: "e1", title: "Developer", subtitle: "Acme", bullets: ["Built APIs"] }] }] };

async function connect(routes: Record<string, (body: unknown) => unknown>) {
  const calls: string[] = [];
  const backend = {
    async request<T>(path: string, init: RequestInit = {}) {
      const key = `${init.method ?? "GET"} ${path}`;
      calls.push(key);
      const route = routes[key];
      if (!route) throw new Error(`unexpected ${key}`);
      return route(init.body ? JSON.parse(String(init.body)) : undefined) as T;
    },
  };
  const server = new McpServer({ name: "test", version: "0" });
  registerTools(server, { backend, principal: "user_test" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(b);
  const tool = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args }) as { isError?: boolean; content: { text: string }[] };
    return { error: result.isError === true, value: result.isError ? result.content[0].text : JSON.parse(result.content[0].text) };
  };
  return { calls, tool };
}

const composed = { templateId: "44444444-4444-4444-8444-444444444444", templateName: "Job application", subject: "Application", body: "Hello", missingFields: [], unknownPlaceholders: [] };
const gmailReady = { configured: true, connected: true, canSend: true, googleEmail: "me@gmail.com" };
const driveReady = { configured: true, connected: true, permissionGranted: true, folderName: "CareerPilot" };
const DRIVE_DOC = "55555555-5555-4555-8555-555555555555";
const OLD_LINK = "https://drive.google.com/file/d/old/view";
const NEW_LINK = "https://drive.google.com/file/d/tailored/view";

describe("apply flow", () => {
  it("imports a link as a deduplicated job and returns the HR email", async () => {
    let saved: Record<string, unknown> = {};
    const { tool } = await connect({
      "POST /jobs/import-from-url": () => ({ title: "Dev", company: "Acme", location: "", workMode: "", description: "Node", hrEmail: "hr@acme.com", ai: true }),
      "POST /jobs": (body) => { saved = body as Record<string, unknown>; return { id: JOB, ...saved }; },
    });
    const result = await tool("import_job_from_link", { url: "https://acme.com/jobs/1" });
    expect(result.value.hrEmail).toBe("hr@acme.com");
    expect(saved).toMatchObject({ source: "LINK", externalId: "https://acme.com/jobs/1", workMode: null });
  });

  // The form copy is empty, as for a resume edited in the document editor; the content is in the document
  const document = { styles: { ".name": { "font-weight": "700" } }, sections: [
    { id: "header", nodes: [{ tag: "h1", role: "name", text: "Rajesh" }, { tag: "p", role: "headline", text: "Java Developer" }] },
    { id: "experience", nodes: [{ tag: "ul", children: [{ tag: "li", text: "Built APIs" }] }] },
  ] };
  const myResume = { id: RESUME, title: "My resume", data: { sections: [] }, document, templateId: "classic", pageSize: "A4" };

  it("creates the assistant's resume from the user's resume the first time, leaving the user's resume alone", async () => {
    let created: Record<string, unknown> = {};
    let upload: Record<string, unknown> = {};
    const { calls, tool } = await connect({
      [`GET /jobs/${JOB}`]: () => ({ title: "Full Stack Intern", company: "Mecntech", description: "React, Spring" }),
      [`GET /resumes/${RESUME}`]: () => myResume,
      // The user named one of their own resumes "Resume": it is not the AI copy
      "GET /resumes": () => [{ id: RESUME, title: "My resume", aiCopy: false }, { id: "x", title: "Resume", aiCopy: false }],
      "PUT /resumes/ai-copy": (body) => { created = body as Record<string, unknown>; return { id: AI_RESUME, aiCopy: true, ...created }; },
      "GET /drive/status": () => driveReady,
      "POST /resumes/render/drive": (body) => { upload = body as Record<string, unknown>; return { id: DRIVE_DOC, name: "Resume - Mecntech.pdf", webViewLink: NEW_LINK }; },
    });
    const tailoring = (await tool("tailor_resume_for_job", { resumeId: RESUME, jobId: JOB })).value;
    expect(tailoring.resume.mode).toBe("document");
    expect(tailoring.resume.textBlocks.map((b: { path: string }) => b.path)).toEqual(["header/1", "experience/0.0"]);

    expect((await tool("save_tailored_resume", { resumeId: RESUME, data: resumeData })).error).toBe(true);
    const result = (await tool("save_tailored_resume", { resumeId: RESUME, jobId: JOB, edits: [{ path: "experience/0.0", text: "Built REST APIs with Spring Boot" }] })).value;
    expect(result).toMatchObject({ tailoredResumeId: AI_RESUME, created: true, changes: [{ path: "experience/0.0", before: "Built APIs", after: "Built REST APIs with Spring Boot" }] });
    expect(result.drive).toMatchObject({ driveDocumentId: DRIVE_DOC, link: NEW_LINK });
    expect(upload).toMatchObject({ resumeId: AI_RESUME, fileName: "Resume - Mecntech" });
    expect(JSON.stringify(upload.document)).toContain("Built REST APIs with Spring Boot");
    expect(created).toMatchObject({ title: "Resume", templateId: "classic", pageSize: "A4" });
    expect(JSON.stringify(created.document)).toContain("Built REST APIs with Spring Boot");
    expect(JSON.stringify(created.document)).toContain("font-weight");
    expect(calls.some((call) => call.startsWith(`PUT /resumes/${RESUME}`) || call.startsWith("PUT /resumes/x") || call.includes("/versions"))).toBe(false);
  });

  it("reuses the assistant's resume, rebuilt from the user's resume each time", async () => {
    let updated: Record<string, unknown> = {};
    const { calls, tool } = await connect({
      [`GET /resumes/${RESUME}`]: () => myResume,
      // The user renamed the AI copy: it is still found, and keeps the new name
      "GET /resumes": () => [{ id: RESUME, title: "My resume", aiCopy: false }, { id: AI_RESUME, title: "Applications", aiCopy: true }],
      "PUT /resumes/ai-copy": (body) => { updated = body as Record<string, unknown>; return { id: AI_RESUME, aiCopy: true, ...updated }; },
      "GET /drive/status": () => ({ ...driveReady, connected: false }),
    });
    const result = (await tool("save_tailored_resume", { resumeId: RESUME, edits: [{ path: "header/1", text: "Full Stack Developer" }] })).value;
    expect(result).toMatchObject({ tailoredResumeId: AI_RESUME, created: false, drive: null });
    expect(result.note).toMatch(/Google Drive/);
    expect(calls).not.toContain("POST /resumes/render/drive");
    // Only this job's edit: the previous tailoring isn't carried over
    expect(JSON.stringify(updated.document)).toContain("Full Stack Developer");
    expect(JSON.stringify(updated.document)).toContain("Built APIs");
    expect(updated.title).toBe("Applications");
  });

  it("refuses to tailor from the assistant's own resume", async () => {
    const { tool } = await connect({
      [`GET /resumes/${AI_RESUME}`]: () => ({ ...myResume, id: AI_RESUME, title: "Applications", aiCopy: true }),
    });
    const result = await tool("tailor_resume_for_job", { resumeId: AI_RESUME, jobDescription: "React" });
    expect(result.error).toBe(true);
    expect(result.value).toMatch(/own resumes/);
  });

  it("blocks a subject with line breaks before handing out an approval", async () => {
    const { tool } = await connect({
      [`POST /jobs/${JOB}/emails/compose`]: () => ({ ...composed, subject: "Application: Intern\nLocation: Bangalore" }),
      "GET /gmail/status": () => gmailReady,
    });
    const result = (await tool("prepare_application_email", { jobId: JOB, to: "2021BIT057@sggs.ac.in" })).value;
    expect(result.ready).toBe(false);
    expect(result.blockers[0]).toMatch(/line breaks/);
  });

  it("does not hand out an approval while the email can't be sent", async () => {
    const { tool } = await connect({
      [`POST /jobs/${JOB}/emails/compose`]: () => ({ ...composed, missingFields: [{ placeholder: "{{resume_url}}", label: "Resume link" }] }),
      "GET /gmail/status": () => ({ ...gmailReady, canSend: false }),
    });
    const result = await tool("prepare_application_email", { jobId: JOB, to: "hr@acme.com" });
    expect(result.value.ready).toBe(false);
    expect(result.value.approvalToken).toBeUndefined();
    expect(result.value.blockers).toHaveLength(2);
  });

  it("attaches the saved Drive PDF and shows its real link before sending", async () => {
    let sent: Record<string, unknown> = {};
    const { calls, tool } = await connect({
      [`POST /jobs/${JOB}/emails/compose`]: () => ({ ...composed, body: `Hello. My resume: ${OLD_LINK}` }),
      "GET /gmail/status": () => gmailReady,
      "GET /drive/documents": () => [{ id: DRIVE_DOC, name: "Resume - Mecntech.pdf", webViewLink: NEW_LINK }],
      "GET /me/fields": () => [{ key: "resume_url", label: "Resume link", value: OLD_LINK }],
      [`POST /jobs/${JOB}/emails`]: (body) => { sent = body as Record<string, unknown>; return { id: "sent" }; },
    });
    const prepared = (await tool("prepare_application_email", { jobId: JOB, to: "2021BIT057@sggs.ac.in", driveDocumentId: DRIVE_DOC })).value;
    const { approvalToken, to, subject, body, templateId, driveDocumentId } = prepared;
    expect(body).toBe(`Hello. My resume: ${NEW_LINK}`);
    expect(prepared.attachment).toEqual({ name: "Resume - Mecntech.pdf", link: NEW_LINK });

    expect((await tool("send_application_email", { jobId: JOB, approvalToken, to, subject, body: "Changed", templateId, driveDocumentId })).error).toBe(true);
    expect((await tool("send_application_email", { jobId: JOB, approvalToken, to, subject, body, templateId, driveDocumentId })).error).toBe(false);
    expect(sent).toMatchObject({ to: "2021BIT057@sggs.ac.in", body: `Hello. My resume: ${NEW_LINK}`, driveDocumentId: DRIVE_DOC, confirmed: true });
    expect(calls.some((call) => call.includes("/render/drive") || call.startsWith("PUT "))).toBe(false);
  });

  it("asks to save the resume again when its Drive file is gone", async () => {
    const { tool } = await connect({
      [`POST /jobs/${JOB}/emails/compose`]: () => composed,
      "GET /gmail/status": () => gmailReady,
      "GET /drive/documents": () => [],
      "GET /me/fields": () => [],
    });
    const result = (await tool("prepare_application_email", { jobId: JOB, to: "2021BIT057@sggs.ac.in", driveDocumentId: DRIVE_DOC })).value;
    expect(result.ready).toBe(false);
    expect(result.blockers.join()).toMatch(/save_tailored_resume/);
  });

  it("sends nothing when Gmail can't send", async () => {
    let gmail = gmailReady;
    const { calls, tool } = await connect({
      [`POST /jobs/${JOB}/emails/compose`]: () => composed,
      "GET /gmail/status": () => gmail,
      "GET /drive/documents": () => [{ id: DRIVE_DOC, name: "Resume.pdf", webViewLink: NEW_LINK }],
      "GET /me/fields": () => [],
    });
    const prepared = (await tool("prepare_application_email", { jobId: JOB, to: "2021BIT057@sggs.ac.in", driveDocumentId: DRIVE_DOC })).value;
    gmail = { ...gmailReady, canSend: false };
    const { approvalToken, to, subject, body, templateId, driveDocumentId } = prepared;
    expect((await tool("send_application_email", { jobId: JOB, approvalToken, to, subject, body, templateId, driveDocumentId })).error).toBe(true);
    expect(calls.some((call) => call.endsWith("/emails"))).toBe(false);
  });
});
