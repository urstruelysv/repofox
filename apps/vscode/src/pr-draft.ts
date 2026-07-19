import type { PRApprovalInput } from "@repofox/core";

export type PRDraftParseResult =
  | { ok: true; value: PRApprovalInput }
  | { ok: false; error: string };

const FRONTMATTER_DELIMITER = "---";

export function serializePRDraft(input: PRApprovalInput): string {
  return [
    FRONTMATTER_DELIMITER,
    `title: ${input.title}`,
    `labels: ${input.labels.join(", ")}`,
    FRONTMATTER_DELIMITER,
    "",
    input.body.trim(),
    "",
  ].join("\n");
}

export function parsePRDraft(text: string): PRDraftParseResult {
  const normalized = text.replace(/\r\n/g, "\n");
  const match = normalized.match(
    /^---\ntitle:\s*(.*)\nlabels:\s*(.*)\n---\n([\s\S]*)$/,
  );
  if (!match) {
    return { ok: false, error: "PR draft frontmatter is invalid." };
  }

  const title = match[1]?.trim() ?? "";
  const body = match[3]?.trim() ?? "";
  if (!title || !body) {
    return { ok: false, error: "PR draft requires a title and body." };
  }

  const labels = (match[2] ?? "")
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean);

  return { ok: true, value: { title, labels, body } };
}
