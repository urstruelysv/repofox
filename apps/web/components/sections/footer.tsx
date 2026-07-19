import { BranchIcon } from "@/components/ui/icons";

import { installInstructionsUrl, repositoryUrl } from "@/lib/repo-links";

export function Footer() {
  const footerLinks = [
    { l: "GitHub", h: repositoryUrl },
    { l: "Install", h: installInstructionsUrl },
    { l: "Security", h: `${repositoryUrl}/blob/main/SECURITY.md` },
  ];

  return (
    <footer className="bg-white border-t border-pop-border py-12 px-6">
      <div className="max-w-[1120px] mx-auto flex gap-6 flex-wrap items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center text-white">
            <BranchIcon />
          </div>
          <span className="text-[14px] font-bold text-pop-black">RepoFox</span>
          <span className="text-[12px] text-pop-muted">
            AGPLv3 · open source
          </span>
        </div>
        <div className="flex gap-7 flex-wrap">
          {footerLinks.map(({ l, h }) => (
            <a
              key={l}
              href={h}
              className="text-[12px] text-pop-muted no-underline transition-colors hover:text-primary"
            >
              {l}
            </a>
          ))}
        </div>
        <div className="text-[12px] text-pop-muted">Built in public · 2026</div>
      </div>
    </footer>
  );
}
