/*
 * Checks an AI-tailored resume against the original so a proposal can only rephrase, reorder or hide what the user
 * already wrote: no new jobs, schools or projects, no changed employers or dates, no skills that appear nowhere in the
 * original. Wording of descriptions and bullets is left to the user's review of the diff.
 */

type Loose = Record<string, unknown>;
type Entry = { id?: unknown; title?: unknown; subtitle?: unknown; startDate?: unknown; endDate?: unknown };
type Section = { id?: unknown; type?: unknown; entries?: Entry[]; groups?: { keywords?: unknown[] }[] };

const sections = (resume: unknown): Section[] =>
  Array.isArray((resume as Loose | null)?.sections) ? (resume as { sections: Section[] }).sections : [];
const norm = (value: unknown) => (typeof value === "string" ? value.trim().toLowerCase() : "");

export function groundingProblems(original: unknown, tailored: unknown): string[] {
  const problems: string[] = [];
  const entries = new Map<string, Entry>();
  for (const section of sections(original)) for (const entry of section.entries ?? []) entries.set(String(entry.id), entry);
  const originalText = JSON.stringify(original).toLowerCase();

  for (const section of sections(tailored)) {
    for (const entry of section.entries ?? []) {
      const before = entries.get(String(entry.id));
      if (!before) {
        problems.push(`New entry "${String(entry.title)}" is not in the original resume; keep the original entry ids.`);
        continue;
      }
      for (const field of ["title", "subtitle", "startDate", "endDate"] as const) {
        if (norm(entry[field]) !== norm(before[field])) {
          problems.push(`Entry "${String(before.title)}" changed its ${field}; employers, roles and dates must stay as they are.`);
        }
      }
    }
    for (const group of section.groups ?? []) {
      for (const keyword of group.keywords ?? []) {
        if (norm(keyword) && !originalText.includes(norm(keyword))) {
          problems.push(`Skill "${String(keyword)}" does not appear anywhere in the original resume.`);
        }
      }
    }
  }
  return problems;
}
