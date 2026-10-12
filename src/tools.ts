import { z } from "zod";
import { CareerPilotApi } from "./careerpilot-api.js";

export const toolSchemas = {
  careerpilot_api_status: z.object({}),
  get_resume_schema: z.object({}),
  get_resume_templates: z.object({}),
  list_my_resumes: z.object({}),
  create_resume_draft: z.object({
    title: z.string().trim().min(1).max(120),
    templateId: z.string().trim().max(80).optional(),
    data: z.record(z.string(), z.unknown()),
  }),
  preview_resume: z.object({
    templateId: z.string().trim().max(80).optional(),
    data: z.record(z.string(), z.unknown()),
  }),
};

export const toolDescriptions: Record<keyof typeof toolSchemas, string> = {
  careerpilot_api_status: "Check whether the configured CareerPilot API is reachable.",
  get_resume_schema: "Get CareerPilot's JSON schema for resume content.",
  get_resume_templates: "List resume templates available in CareerPilot.",
  list_my_resumes: "List resumes available to the authenticated CareerPilot user.",
  create_resume_draft: "Create a resume draft. Review the content before using it.",
  preview_resume: "Render resume HTML for review without saving a resume.",
};

export async function callCareerPilotTool(api: CareerPilotApi, name: string, rawArgs: unknown) {
  let result: unknown;

  switch (name) {
    case "careerpilot_api_status":
      result = await api.request("/health");
      break;
    case "get_resume_schema":
      result = await api.request("/resumes/schema");
      break;
    case "get_resume_templates":
      result = await api.request("/resumes/templates");
      break;
    case "list_my_resumes":
      result = await api.request("/resumes");
      break;
    case "create_resume_draft": {
      const parsed = toolSchemas.create_resume_draft.parse(rawArgs);
      result = await api.request("/resumes", {
        method: "POST",
        body: JSON.stringify({
          title: parsed.title,
          ...(parsed.templateId ? { templateId: parsed.templateId } : {}),
          pageSize: "A4",
          data: parsed.data,
        }),
      });
      break;
    }
    case "preview_resume": {
      const parsed = toolSchemas.preview_resume.parse(rawArgs);
      result = await api.request("/resumes/render/preview", {
        method: "POST",
        headers: { Accept: "text/html" },
        body: JSON.stringify({
          ...(parsed.templateId ? { templateId: parsed.templateId } : {}),
          data: parsed.data,
          pageSize: "A4",
        }),
      });
      break;
    }
    default:
      throw new Error(`Unknown CareerPilot tool: ${name}`);
  }

  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    structuredContent: { data: result },
    isError: false,
  };
}
