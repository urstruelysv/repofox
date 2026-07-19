import { describe, expect, it } from "vitest";
import { getWorkflowAccess } from "./workflow-access.js";

describe("getWorkflowAccess", () => {
  it("allows a configured workspace to run through push without a GitHub token", () => {
    expect(
      getWorkflowAccess({ hasApiKey: true, hasGitHubToken: false }),
    ).toEqual({
      canRun: true,
      prCreationDisabled: true,
    });
  });

  it("requires Settings only when the AI key is missing", () => {
    expect(
      getWorkflowAccess({ hasApiKey: false, hasGitHubToken: false }),
    ).toEqual({
      canRun: false,
      prCreationDisabled: true,
    });
  });
});
