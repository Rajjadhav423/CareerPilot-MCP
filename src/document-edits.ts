/*
 * Tailoring for resumes edited as documents. Converting a document to form data and back is lossy (header layout,
 * links, inline labels), so the assistant edits the document's own text instead: it gets every editable block with a
 * path, returns new content for some of them, and everything else (structure, styles, links) stays untouched.
 *
 * A path is "<section id>/<child index>.<child index>…", e.g. "experience/1.2.0".
 * A block holds plain `text` or inline `html` (<b>, <i>, links); an edit replaces the same field, and the backend
 * validates the html when the suggestion is saved.
 * Locked: the name, contact line, section and entry titles (role, employer), dates, links, and saved details ({{…}}).
 * Skill lines may only list skills that already appear somewhere in the resume.
 */

type Node = { tag?: string; role?: string; class?: string; text?: string; html?: string; children?: Node[] };
type Document = { sections?: { id?: string; nodes?: Node[] }[] };

export type TextBlock = { path: string; section: string; format: "text" | "html"; content: string };
export type TextEdit = { path: string; text: string };

const LOCKED_ROLES = new Set(["name", "contact", "section-title", "entry-title", "date"]);
const LOCKED_CLASSES = /\b(row-date|date|contact|section-title|entry-title|name)\b/;
const MAX_TEXT = 1500;

const content = (node: Node) => (typeof node.html === "string" ? node.html : node.text);
const locked = (node: Node, ancestors: Node[]) =>
  [node, ...ancestors].some((n) => n.tag === "a" || LOCKED_ROLES.has(n.role ?? "") || LOCKED_CLASSES.test(n.class ?? ""))
  || (content(node) ?? "").includes("{{");
const plain = (html: string) => html.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").toLowerCase();

function walk(document: Document, visit: (path: string, section: string, node: Node, ancestors: Node[]) => void) {
  for (const section of document.sections ?? []) {
    const go = (nodes: Node[], prefix: string, ancestors: Node[]) => nodes.forEach((node, i) => {
      const path = prefix ? `${prefix}.${i}` : String(i);
      visit(`${section.id}/${path}`, String(section.id), node, ancestors);
      if (node.children) go(node.children, path, [node, ...ancestors]);
    });
    go(section.nodes ?? [], "", []);
  }
}

function editable(document: Document): Map<string, { section: string; node: Node }> {
  const blocks = new Map<string, { section: string; node: Node }>();
  walk(document, (path, section, node, ancestors) => {
    if ((content(node) ?? "").trim() && !locked(node, ancestors)) blocks.set(path, { section, node });
  });
  return blocks;
}

/** The content the assistant may rewrite. */
export function editableBlocks(document: unknown): TextBlock[] {
  return [...editable(document as Document)].map(([path, { section, node }]) => ({
    path, section, format: typeof node.html === "string" ? "html" : "text", content: content(node)!,
  }));
}

/** A copy of the document with the edits applied; throws with every problem when any edit isn't allowed. */
export function applyEdits(document: unknown, edits: TextEdit[]): Record<string, unknown> {
  const copy = structuredClone(document) as Document;
  const blocks = editable(copy);
  const known = plain(JSON.stringify(document));
  const problems: string[] = [];
  for (const edit of edits) {
    const block = blocks.get(edit.path);
    const text = edit.text.trim();
    if (!block) problems.push(`${edit.path}: not an editable block (use a path from tailor_resume_for_job).`);
    else if (!text) problems.push(`${edit.path}: can't be empty; leave the block out to keep it.`);
    else if (text.length > MAX_TEXT) problems.push(`${edit.path}: longer than ${MAX_TEXT} characters.`);
    else if (text.includes("{{")) problems.push(`${edit.path}: placeholders like {{…}} can't be added.`);
    else {
      const unknown = block.node.role === "skill-group" ? newSkills(text, known) : [];
      if (unknown.length > 0) problems.push(`${edit.path}: ${unknown.join(", ")} not in the original resume.`);
      else if (typeof block.node.html === "string") block.node.html = text;
      else block.node.text = text;
    }
  }
  if (problems.length > 0) throw new Error(`Some edits can't be applied:\n- ${problems.join("\n- ")}`);
  return copy as Record<string, unknown>;
}

/** Skills in a "Label: a, b, c" line that appear nowhere in the original resume. */
function newSkills(line: string, known: string): string[] {
  const list = plain(line).replace(/^[^:]*:/, "");
  return list.split(/[,;|]/).map((skill) => skill.trim()).filter((skill) => skill && !known.includes(skill));
}
