import { describe, expect, it } from "vitest";

import { tokens } from "../../../packages/ui/src/tokens";
import webTheme from "../tailwind.config";

describe("RepoFox indigo brand tokens", () => {
  it("uses the approved indigo accents in the VS Code UI", () => {
    expect(tokens.color.border.focus).toBe("#4F46E5");
    expect(tokens.color.accent).toEqual({
      primary: "#4F46E5",
      hover: "#4338CA",
      active: "#3730A3",
    });
  });

  it("uses the approved indigo accents on the website", () => {
    const colors = webTheme.theme?.extend?.colors as {
      primary: { DEFAULT: string; hover: string };
      pop: { accent: string };
    };

    expect(colors.primary).toEqual({
      DEFAULT: "#4F46E5",
      hover: "#4338CA",
    });
    expect(colors.pop.accent).toBe("#818CF8");
  });
});
