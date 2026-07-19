import { describe, expect, it } from "vitest";

import extensionManifest from "../../vscode/package.json";

import {
  installInstructionsUrl,
  releaseUrl,
  repositoryUrl,
  vsixUrl,
} from "./repo-links";

describe("judge-facing repository links", () => {
  it("keeps release, VSIX, and installation guidance under one repository", () => {
    expect(releaseUrl).toBe(`${repositoryUrl}/releases/latest`);
    expect(vsixUrl).toBe(`${releaseUrl}/download/repofox-0.0.1.vsix`);
    expect(installInstructionsUrl).toBe(
      `${repositoryUrl}#install-from-a-release`,
    );
  });

  it("keeps extension metadata aligned with the public repository", () => {
    expect(extensionManifest.homepage).toBe(repositoryUrl);
    expect(extensionManifest.bugs.url).toBe(`${repositoryUrl}/issues`);
    expect(extensionManifest.repository.url).toBe(`${repositoryUrl}.git`);
  });
});
