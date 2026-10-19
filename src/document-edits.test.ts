import { describe, expect, it } from "vitest";
import { applyEdits, editableBlocks } from "./document-edits.js";

const document = {
  styles: { ".name": { "font-weight": "700" } },
  sections: [
    { id: "header", nodes: [{ tag: "div", class: "header", children: [
      { tag: "h1", role: "name", text: "Rajesh Jadhav" },
      { tag: "p", role: "headline", text: "Java Developer" },
      { tag: "p", role: "contact", children: [{ tag: "a", text: "{{email}}" }] },
    ] }] },
    { id: "experience", nodes: [{ tag: "div", class: "entry", children: [
      { tag: "p", role: "entry-title", html: "Software Developer | Acme" },
      { tag: "span", class: "row-date", text: "2023 – Present" },
      { tag: "ul", children: [{ tag: "li", html: "Built <b>REST APIs</b>" }] },
      { tag: "ul", children: [{ tag: "li", role: "skill-group", html: "<b>Backend:</b> Spring Boot, Node.js" }] },
    ] }] },
  ],
};

describe("document edits", () => {
  it("offers only free text: not the name, contact, links or dates", () => {
    expect(editableBlocks(document).map((b) => b.content)).toEqual([
      "Java Developer", "Built <b>REST APIs</b>", "<b>Backend:</b> Spring Boot, Node.js",
    ]);
  });

  it("changes only the edited text and keeps everything else", () => {
    const edited = applyEdits(document, [
      { path: "header/0.1", text: "Full Stack Developer | Java, React" },
      { path: "experience/0.2.0", text: "Designed and built <b>REST APIs</b> with Spring Boot" },
      { path: "experience/0.3.0", text: "<b>Backend:</b> Node.js, Spring Boot" },
    ]);
    const blocks = editableBlocks(edited).map((b) => b.content);
    expect(blocks).toContain("Full Stack Developer | Java, React");
    expect(blocks).toContain("<b>Backend:</b> Node.js, Spring Boot");
    expect(JSON.stringify(edited)).toContain("Software Developer | Acme");
    expect(JSON.stringify(edited)).toContain("{{email}}");
    expect(edited.styles).toEqual(document.styles);
    expect(document.sections[0].nodes[0].children[1].text).toBe("Java Developer");
  });

  it("rejects locked, unknown and placeholder edits", () => {
    expect(() => applyEdits(document, [
      { path: "header/0.0", text: "Someone Else" },
      { path: "experience/0.1", text: "2019 – Present" },
      { path: "experience/9", text: "New job" },
      { path: "header/0.1", text: "{{github}}" },
      { path: "experience/0.3.0", text: "<b>Backend:</b> Spring Boot, Kubernetes" },
    ])).toThrow(/header\/0\.0[\s\S]*experience\/0\.1[\s\S]*experience\/9[\s\S]*placeholders[\s\S]*kubernetes/);
  });
});
