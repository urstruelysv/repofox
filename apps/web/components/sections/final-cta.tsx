import { CodeIcon, GitHubIcon } from "@/components/ui/icons";

import { repositoryUrl, vsixUrl } from "@/lib/repo-links";

export function FinalCTA() {
  return (
    <section className="bg-white py-24 px-6 text-center border-t border-pop-border relative overflow-hidden">
      <div className="max-w-[640px] mx-auto relative z-10">
        <h2 className="text-[clamp(32px,5.5vw,44px)] font-medium tracking-[-2.32px] leading-[1.1] text-pop-black mb-5 animate-in fade-in slide-in-from-bottom-4 duration-700">
          Ship the change
          <br />
          without losing control.
        </h2>
        <p className="text-[17px] text-pop-muted leading-relaxed tracking-[-0.45px] mb-10 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
          Install the VS Code extension, add an AI provider key, and review
          every proposed step.
          <br />
          GitHub is optional until you are ready to create a pull request.
        </p>
        <div className="flex gap-3 justify-center flex-wrap animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
          <a
            href={vsixUrl}
            className="pop-button pop-button-primary h-14 px-8 shadow-pop hover:-translate-y-0.5 inline-flex items-center gap-2"
          >
            <CodeIcon /> Download VSIX
          </a>
          <a
            href={repositoryUrl}
            className="pop-button bg-white border border-pop-border h-14 px-8 inline-flex items-center gap-2 text-pop-black hover:border-primary hover:text-primary transition-colors"
          >
            <GitHubIcon /> View source and setup
          </a>
        </div>
      </div>
    </section>
  );
}
