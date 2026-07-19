export interface WorkflowAccessInput {
  hasApiKey: boolean;
  hasGitHubToken: boolean;
}

export interface WorkflowAccess {
  canRun: boolean;
  prCreationDisabled: boolean;
}

export function getWorkflowAccess(input: WorkflowAccessInput): WorkflowAccess {
  return {
    canRun: input.hasApiKey,
    prCreationDisabled: !input.hasGitHubToken,
  };
}
