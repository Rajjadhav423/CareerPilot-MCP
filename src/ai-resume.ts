import type { BackendClient } from "./backend.js";
import { applyEdits, editableBlocks, type TextEdit } from "./document-edits.js";
import { groundingProblems } from "./grounding.js";

/*
 * The assistant's own resume. Tailoring never changes the user's resumes: it rebuilds this one from the resume the
 * user chose (the source) plus the job's edits, so each application starts from the user's resume, not from the
 * previous job's tailoring. The backend keeps one per user, flagged `aiCopy`, created the first time and reused after
 * (PUT /resumes/ai-copy), so renaming it or naming another resume "Resume" changes nothing.
 */

/** The title the assistant gives its copy (it's found by the aiCopy flag, not by this). */
export const AI_RESUME_TITLE = "Resume";

export type Resume = { id: string; title: string; templateId: string; pageSize: string; data: unknown; document: Record<string, unknown> | null; aiCopy?: boolean };
type ResumeSummary = { id: string; title: string; aiCopy?: boolean };
export type Change = { path: string; before: string; after: string };

/** The assistant's resume, or null before the first tailoring. */
export async function findAiResume(backend: BackendClient): Promise<ResumeSummary | null> {
  const resumes = await backend.request<ResumeSummary[]>("/resumes");
  return resumes.find((resume) => resume.aiCopy === true) ?? null;
}

/** Refuses the assistant's own resume as a source: tailoring always starts from one the user wrote. */
export async function sourceResume(backend: BackendClient, resumeId: string): Promise<Resume> {
  const resume = await backend.request<Resume>(`/resumes/${resumeId}`);
  if (resume.aiCopy) {
    throw new Error(`"${resume.title}" is the assistant's tailored copy. Tailor from one of the user's own resumes (list_my_resumes).`);
  }
  return resume;
}

/**
 * Writes the source resume plus the tailoring into the assistant's resume (creating it the first time) and returns
 * it with the changes made. Document resumes take text `edits`; form resumes take the full tailored `data`.
 */
export async function saveTailoredResume(backend: BackendClient, sourceId: string, tailoring: { edits?: TextEdit[] | null; data?: Record<string, unknown> | null })
  : Promise<{ resume: Resume; created: boolean; changes: Change[] }> {
  const source = await sourceResume(backend, sourceId);
  let content: { data: unknown; document: Record<string, unknown> | null };
  let changes: Change[];
  if (source.document) {
    if (!tailoring.edits?.length) throw new Error("This resume is a document: pass `edits` with paths from tailor_resume_for_job, not `data`.");
    const document = applyEdits(source.document, tailoring.edits);
    // The form copy rides along unchecked: a resume with a document prints its document
    content = { data: source.data, document };
    const before = new Map(editableBlocks(source.document).map((block) => [block.path, block.content]));
    changes = editableBlocks(document)
      .filter((block) => before.get(block.path) !== block.content)
      .map((block) => ({ path: block.path, before: before.get(block.path) ?? "", after: block.content }));
  } else {
    if (!tailoring.data) throw new Error("This resume is a form: pass the full tailored `data`.");
    const problems = groundingProblems(source.data, tailoring.data);
    if (problems.length > 0) throw new Error(`The tailored resume adds facts that are not in the original:\n- ${problems.join("\n- ")}`);
    content = { data: tailoring.data, document: null };
    changes = [{ path: "data", before: "the original resume", after: "the tailored resume data" }];
  }

  const existing = await findAiResume(backend);
  // Keeps a name the user gave it
  const body = JSON.stringify({ title: existing?.title ?? AI_RESUME_TITLE, templateId: source.templateId, pageSize: source.pageSize, ...content });
  const resume = await backend.request<Resume>("/resumes/ai-copy", { method: "PUT", body });
  return { resume, created: !existing, changes };
}
