import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const appRoot = resolve(import.meta.dirname, "..");
const readWebFile = (path: string) =>
  readFileSync(resolve(appRoot, path), "utf8");

describe("Build Week judge journey", () => {
  it("offers a direct VSIX download from both landing-page calls to action", () => {
    const hero = readWebFile("components/sections/hero-new.tsx");
    const finalCta = readWebFile("components/sections/final-cta.tsx");

    expect(hero).toMatch(
      /import \{ vsixUrl \} from ["']@\/lib\/repo-links["']/,
    );
    expect(hero).toContain("Download VSIX");
    expect(finalCta).toMatch(
      /import \{ repositoryUrl, vsixUrl \} from ["']@\/lib\/repo-links["']/,
    );
    expect(finalCta).toContain("Download VSIX");
    expect(finalCta).toContain("View source and setup");
  });

  it("renders no speculative marketing sections", () => {
    const home = readWebFile("app/page.tsx");
    const hero = readWebFile("components/sections/hero-new.tsx");

    expect(home).not.toContain("WorksEverywhere");
    expect(home).not.toContain("Testimonials");
    expect(home).not.toContain("Comparison");
    expect(home).not.toContain("Pricing");
    expect(home).not.toContain("StatsBar");
    expect(hero).not.toMatch(
      /~20 min|20-minute|100% (savings|automated)|one click/i,
    );
    expect(home).not.toMatch(/Cursor|JetBrains|IntelliJ|WebStorm/i);
  });

  it("uses canonical source and release links in navigation and footer", () => {
    const navbar = readWebFile("components/sections/navbar.tsx");
    const footer = readWebFile("components/sections/footer.tsx");

    expect(navbar).toMatch(
      /import \{ repositoryUrl, vsixUrl \} from ["']@\/lib\/repo-links["']/,
    );
    expect(navbar).toContain("Download VSIX");
    expect(footer).toMatch(
      /import \{ installInstructionsUrl, repositoryUrl \} from ["']@\/lib\/repo-links["']/,
    );
    expect(footer).not.toMatch(/coming-soon/i);
  });

  it("has removed waitlist data collection and redirects old routes", () => {
    expect(existsSync(resolve(appRoot, "app/api/waitlist/route.ts"))).toBe(
      false,
    );
    expect(existsSync(resolve(appRoot, "app/waitlist/page.tsx"))).toBe(false);

    const config = readWebFile("next.config.ts");
    expect(config).toMatch(/source: ["']\/waitlist["']/);
    expect(config).toMatch(/source: ["']\/coming-soon["']/);
  });

  it("does not retain the waitlist database dependency", () => {
    const packageJson = readWebFile("package.json");

    expect(packageJson).not.toContain('"postgres"');
  });
});
