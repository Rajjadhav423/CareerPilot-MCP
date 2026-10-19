import { describe, expect, it } from "vitest";
import { groundingProblems } from "./grounding.js";

const original = {
  sections: [
    { id: "s1", type: "entries", entries: [{ id: "e1", title: "Developer", subtitle: "Acme", startDate: "2022-01", endDate: null, bullets: ["Built APIs in Node.js"] }] },
    { id: "s2", type: "skills", groups: [{ id: "g1", keywords: ["TypeScript", "PostgreSQL"] }] },
  ],
};

describe("groundingProblems", () => {
  it("allows rewording bullets and reordering skills", () => {
    const tailored = structuredClone(original);
    tailored.sections[0].entries![0].bullets = ["Designed and built REST APIs with Node.js"];
    tailored.sections[1].groups![0].keywords = ["PostgreSQL", "TypeScript"];
    expect(groundingProblems(original, tailored)).toEqual([]);
  });

  it("rejects new entries, changed employers and invented skills", () => {
    const tailored = structuredClone(original) as any;
    tailored.sections[0].entries[0].subtitle = "Google";
    tailored.sections[0].entries.push({ id: "e2", title: "Lead", subtitle: "Infosys" });
    tailored.sections[1].groups[0].keywords.push("Kubernetes");
    expect(groundingProblems(original, tailored)).toHaveLength(3);
  });
});
