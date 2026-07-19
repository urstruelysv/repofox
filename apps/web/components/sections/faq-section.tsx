import { FAQItem } from "@/components/ui/faq-item";

export function FAQSection() {
  const faqs = [
    {
      q: "What do I need to try RepoFox?",
      a: "RepoFox supports VS Code 1.85 and later, a Git repository, and an API key for an AI provider you choose. The extension stores keys in VS Code SecretStorage.",
    },
    {
      q: "Do I need a GitHub token?",
      a: "No. RepoFox can guide branch, commit, and push without one. A GitHub token is needed only when you want RepoFox to create a pull request.",
    },
    {
      q: "How do I review a pull request description?",
      a: "RepoFox opens the generated draft in a VS Code Markdown editor. You can edit it, reopen it from the sidebar, and explicitly submit the parsed draft before RepoFox calls GitHub.",
    },
    {
      q: "Where does my code go?",
      a: "RepoFox does not proxy your repository through a RepoFox service. AI requests go directly from your machine to the provider you configure.",
    },
    {
      q: "Can I undo a workflow step?",
      a: "RepoFox records operations and captures snapshots so supported workflow steps can be reviewed and reverted from Operations History.",
    },
    {
      q: "What licence is RepoFox?",
      a: "The open-source code is licensed under AGPLv3. Read the repository licence before redistributing or operating a modified hosted version.",
    },
  ];

  return (
    <section className="bg-white py-24 px-6 border-t border-pop-border">
      <div className="max-w-[680px] mx-auto">
        <div className="mb-12 text-center">
          <h2 className="text-[clamp(26px,3.5vw,38px)] font-medium tracking-[-1.9px] leading-[1.1] text-pop-black">
            Questions
          </h2>
        </div>
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
          {faqs.map((faq, i) => (
            <div key={i}>
              <FAQItem {...faq} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
