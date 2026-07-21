import { describe, expect, it } from "vitest";

import { tokens } from "../../../packages/ui/src/tokens";
import webTheme from "../tailwind.config";

describe("RepoFox indigo brand tokens", () => {
  it("uses the approved indigo accents in the VS Code UI", () => {
    expect(tokens.color.border.focus).toBe("var(--primary)");
    expect(tokens.color.accent).toEqual({
      primary: "var(--primary)",
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
      DEFAULT: "var(--primary)",
      hover: "#4338CA",
    });
    expect(colors.pop.accent).toBe("#818CF8");
  });
});
