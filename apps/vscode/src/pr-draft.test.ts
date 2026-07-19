import { describe, expect, it } from "vitest";
import { parsePRDraft, serializePRDraft } from "./pr-draft.js";

describe("PR draft codec", () => {
  it("round-trips an editable title, labels, and body", () => {
    const draft = serializePRDraft({
      title: "feat(vscode): review PR drafts in an editor",
      labels: ["feature", "vscode"],
      body: "## Summary\n\nLet developers edit the draft before opening a PR.",
    });

    expect(parsePRDraft(draft)).toEqual({
      ok: true,
      value: {
        title: "feat(vscode): review PR drafts in an editor",
        labels: ["feature", "vscode"],
        body: "## Summary\n\nLet developers edit the draft before opening a PR.",
      },
    });
  });

  it("rejects a draft without a title or body", () => {
    expect(parsePRDraft("---\ntitle: \nlabels: bug\n---\n\n")).toEqual({
      ok: false,
      error: "PR draft requires a title and body.",
    });
  });
});
