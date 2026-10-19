import { createHash, randomUUID } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { BackendClient } from "./backend.js";

export const id = z.string().uuid();
export const resumeInput = z.object({
  title: z.string().trim().min(1).max(120),
  templateId: z.string().max(40).nullish(),
  pageSize: z.enum(["A4", "LETTER"]).nullish(),
  data: z.unknown().optional(),
  document: z.unknown().optional(),
  baseDocument: z.unknown().optional(),
});
const renderInput = z.object({
  templateId: z.string().max(40).nullish(),
  pageSize: z.enum(["A4", "LETTER"]).nullish(),
  data: z.unknown().optional(),
  baseDocument: z.unknown().optional(),
  fileName: z.string().max(150).nullish(),
});
export const jobInput = z.object({
  title: z.string().trim().min(1).max(200),
  company: z.string().trim().min(1).max(200),
  location: z.string().max(200).nullish(),
  workMode: z.enum(["ONSITE", "HYBRID", "REMOTE"]).nullish(),
  jobUrl: z.string().max(2048).regex(/^https?:\/\/\S+$/).nullish(),
  description: z.string().max(20_000).nullish(),
  notes: z.string().max(10_000).nullish(),
  status: z.enum(["SAVED", "TO_REVIEW", "PREPARING", "APPLIED", "INTERVIEW", "OFFER", "REJECTED", "CLOSED"]).nullish(),
  source: z.string().max(32).nullish(),
  externalId: z.string().max(200).nullish(),
});
export const emailContent = z.object({
  to: z.string().email().max(254),
  subject: z.string().trim().min(1).max(255).refine((value) => !/[\r\n]/.test(value)),
  body: z.string().trim().min(1).max(20_000),
  templateId: id.nullish(),
  resumeId: id.nullish(),
  driveDocumentId: id.nullish(),
});

type Approval = { userToken: string; expiresAt: number; digest: string };
const approvals = new Map<string, Approval>();
const approvalDigest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const text = (value: unknown) => JSON.stringify(value, null, 2);

export type ToolContext = { backend: BackendClient; userToken: string };
export function registerTools(server: McpServer, context: ToolContext) {
  const call = async <T>(operation: () => Promise<T>) => ({ content: [{ type: "text" as const, text: text(await operation()) }] });

  server.registerTool("careerpilot_api_status", { description: "Check whether the CareerPilot backend is reachable." },
    async () => call(() => context.backend.request("/health", { headers: { Authorization: "" } })));
  server.registerTool("get_resume_schema", { description: "Return CareerPilot's canonical resume JSON schema." },
    async () => call(() => context.backend.request("/resumes/schema")));
  server.registerTool("get_resume_templates", { description: "List available CareerPilot resume templates." },
    async () => call(() => context.backend.request("/resumes/templates")));
  server.registerTool("list_my_resumes", { description: "List only the authenticated user's resumes." },
    async () => call(() => context.backend.request("/resumes")));
  server.registerTool("get_resume_details", { description: "Retrieve an owned resume by id.", inputSchema: { resumeId: id } },
    async ({ resumeId }: { resumeId: string }) => call(() => context.backend.request(`/resumes/${resumeId}`)));
  server.registerTool("create_resume_draft", { description: "Validate and save a resume draft using the existing CareerPilot resume engine.", inputSchema: resumeInput.shape },
    async (input: z.infer<typeof resumeInput>) => call(() => context.backend.request("/resumes", { method: "POST", body: JSON.stringify(input) })));
  server.registerTool("preview_resume", { description: "Render a resume through CareerPilot's existing preview renderer.", inputSchema: renderInput.shape },
    async (input: z.infer<typeof renderInput>) => call(() => context.backend.request("/resumes/render/pages", { method: "POST", body: JSON.stringify(input) })));
  server.registerTool("tailor_resume_for_job", { description: "Fetch an owned resume and return it with a job description and grounding constraints for an AI-generated tailoring proposal. This tool never invents claims or saves changes.", inputSchema: { resumeId: id, jobDescription: z.string().trim().min(1).max(20_000) } },
    async ({ resumeId, jobDescription }: { resumeId: string; jobDescription: string }) => call(async () => ({
      resume: await context.backend.request(`/resumes/${resumeId}`),
      jobDescription,
      constraints: ["Use only facts present in the supplied resume.", "Do not invent qualifications, employers, dates, metrics, or skills.", "Review and save any proposed changes separately."],
    })));
  server.registerTool("save_job", { description: "Save a job for the authenticated user; the backend deduplicates supported external ids.", inputSchema: jobInput.shape },
    async (input: z.infer<typeof jobInput>) => call(() => context.backend.request("/jobs", { method: "POST", body: JSON.stringify(input) })));
  server.registerTool("list_my_jobs", { description: "List the authenticated user's jobs.", inputSchema: { archived: z.boolean().optional(), status: z.string().optional() } },
    async ({ archived, status }: { archived?: boolean; status?: string }) => call(() => context.backend.request(`/jobs?archived=${archived === true ? "true" : "false"}${status ? `&status=${encodeURIComponent(status)}` : ""}`)));
  server.registerTool("get_job_details", { description: "Retrieve an owned job by id.", inputSchema: { jobId: id } },
    async ({ jobId }: { jobId: string }) => call(() => context.backend.request(`/jobs/${jobId}`)));
  server.registerTool("update_job_status", { description: "Update the status of an owned job.", inputSchema: { jobId: id, status: z.enum(["SAVED", "TO_REVIEW", "PREPARING", "APPLIED", "INTERVIEW", "OFFER", "REJECTED", "CLOSED"]) } },
    async ({ jobId, status }: { jobId: string; status: string }) => call(() => context.backend.request(`/jobs/${jobId}`, { method: "PATCH", body: JSON.stringify({ status }) })));
  server.registerTool("prepare_application_email", { description: "Compose an email for review. Provide the exact recipient; sending requires the returned approval token and an exact content match.", inputSchema: { jobId: id, to: z.string().email().max(254), templateId: id.nullish(), timeZone: z.string().max(64).nullish() } },
    async ({ jobId, to, templateId, timeZone }: { jobId: string; to: string; templateId?: string | null; timeZone?: string | null }) => call(async () => {
      const composed = await context.backend.request<Record<string, unknown>>(`/jobs/${jobId}/emails/compose`, { method: "POST", body: JSON.stringify({ templateId, timeZone }) });
      const approvalToken = randomUUID();
      const content = { to: to.trim(), subject: composed.subject, body: composed.body, templateId: templateId ?? null, resumeId: null, driveDocumentId: null };
      approvals.set(approvalToken, { userToken: context.userToken, expiresAt: Date.now() + 15 * 60_000, digest: approvalDigest(content) });
      return { ...composed, to, approvalToken, approvalBinding: "Review the recipient, subject, body, and attachments. Any change requires a new approval." };
    }));
  server.registerTool("send_application_email", { description: "Send a reviewed application email. Requires an unexpired approval token bound to the exact recipient, subject, body, and attachment choices.", inputSchema: { jobId: id, approvalToken: z.string().uuid(), ...emailContent.shape } },
    async ({ jobId, approvalToken, ...input }: { jobId: string; approvalToken: string } & z.infer<typeof emailContent>) => call(async () => {
      const approval = approvals.get(approvalToken);
      const digest = approvalDigest({
        to: input.to.trim(),
        subject: input.subject,
        body: input.body,
        templateId: input.templateId ?? null,
        resumeId: input.resumeId ?? null,
        driveDocumentId: input.driveDocumentId ?? null,
      });
      if (!approval || approval.userToken !== context.userToken || approval.expiresAt < Date.now() || approval.digest !== digest) {
        throw new Error("Approval is missing, expired, or does not match the exact message.");
      }
      approvals.delete(approvalToken);
      return context.backend.request(`/jobs/${jobId}/emails`, { method: "POST", body: JSON.stringify({ ...input, confirmed: true }) });
    }));
  server.registerTool("get_application_email_status", { description: "List email records for an owned job. Results reflect backend acceptance, not delivery or read status.", inputSchema: { jobId: id } },
    async ({ jobId }: { jobId: string }) => call(() => context.backend.request(`/jobs/${jobId}/emails`)));
}
