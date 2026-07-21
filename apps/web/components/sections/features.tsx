import { FeatureRow } from "@/components/ui/feature-row";
import { CodeWindow } from "@/components/ui/code-window";
import { ShieldIcon } from "@/components/ui/icons";

export function Features() {
  return (
    <section
      id="features"
      className="bg-white border-t border-pop-border py-24 px-6"
    >
      <div className="max-w-[1120px] mx-auto flex flex-col gap-[clamp(80px,10vh,120px)]">
        {/* 1 — AI that learns your repo */}
        <FeatureRow
          eyebrow="Context-aware AI"
          headline="Learns how your team names branches and commits."
          body="RepoFox reads your last 50 commits, 10 branch names, and recent PR titles before making any decision. It doesn't use a generic template — it pattern-matches against your actual repo history. The longer you use it, the better it gets."
        >
          <CodeWindow
            title="repofox · context"
            lines={[
              { c: "#a0a0ab", t: "# Reading repo history..." },
              { c: "#10b981", t: "✓ Last 50 commits loaded" },
              { c: "#10b981", t: "✓ Branch patterns: feat/, fix/, chore/" },
              { c: "#10b981", t: "✓ PR style: conventional commits" },
              { c: "#4F46E5", t: "" },
              { c: "#4F46E5", t: "→ Generating branch name..." },
              { c: "#171717", t: "  feat/add-jwt-middleware" },
              { c: "#a0a0ab", t: "" },
              { c: "#a0a0ab", t: "→ Generating commit message..." },
              {
                c: "#171717",
                t: "  feat(auth): add JWT middleware and type guards",
              },
            ]}
          />
        </FeatureRow>

        {/* 2 — Snapshot system */}
        <FeatureRow
          eyebrow="Snapshot system"
          headline="Every step is snapshotted."
          body="RepoFox captures a snapshot before every git mutation. Revert is available during an active session; support for reverting completed sessions is in progress."
          reverse
        >
          <div className="flex flex-col gap-2.5">
            {[
              {
                t: "0",
                label: "Pre-branch snapshot",
                hash: "a3f2c1b4",
                time: "12:34:01",
              },
              {
                t: "1",
                label: "Pre-commit snapshot",
                hash: "b9e8d7c6",
                time: "12:34:18",
              },
              {
                t: "2",
                label: "Pre-push snapshot",
                hash: "c7d6e5f4",
                time: "12:34:22",
              },
              {
                t: "3",
                label: "Pre-PR snapshot",
                hash: "d8e7f6g5",
                time: "12:34:29",
              },
            ].map((s, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-3.5 py-3 bg-white border border-pop-border rounded-xl shadow-pop"
              >
                <div
                  className={`w-[7px] h-[7px] rounded-full shrink-0 ${
                    i < 2
                      ? "bg-green-600 shadow-[0_0_8px_rgba(22,163,74,0.3)]"
                      : i === 2
                        ? "bg-primary shadow-[0_0_8px_rgba(15,118,110,0.3)]"
                        : "bg-pop-gray-400"
                  }`}
                />
                <div className="flex-1">
                  <div className="text-[12px] text-pop-black font-semibold">
                    {s.label}
                  </div>
                  <div className="text-[11px] text-pop-muted font-mono">
                    {s.hash}…
                  </div>
                </div>
                <div className="text-[11px] text-pop-muted font-mono">
                  {s.time}
                </div>
                {i < 3 && (
                  <button className="text-[10px] px-2 py-1 rounded-md border border-red-500/20 bg-transparent text-red-600 cursor-pointer hover:bg-red-50 transition-colors">
                    ↩
                  </button>
                )}
              </div>
            ))}
            <div className="px-3.5 py-2.5 bg-green-500/5 border border-green-500/10 rounded-xl mt-1">
              <div className="text-[12px] text-pop-muted">
                During an active session → restore branch ref + index + working
                tree from a snapshot
              </div>
            </div>
          </div>
        </FeatureRow>

        {/* 3 — BYOK */}
        <FeatureRow
          eyebrow="Privacy-first"
          headline="Your code never touches a RepoFox server."
          body="RepoFox is BYOK — Bring Your Own Key. Your API key is stored in your OS keychain (macOS Keychain, Windows Credential Manager, libsecret on Linux). All AI calls go directly from your machine to Groq, OpenAI, or Anthropic. No proxy. No logging. No trust required."
        >
          <div className="flex flex-col gap-3">
            {[
              {
                who: "Your machine",
                to: "Groq / OpenAI / Anthropic",
                note: "AI calls direct",
                color: "#4F46E5",
              },
              {
                who: "Your machine",
                to: "GitHub API",
                note: "PR creation direct",
                color: "#10b981",
              },
              {
                who: "API keys",
                to: "OS Keychain",
                note: "Never on disk",
                color: "#f59e0b",
              },
            ].map((row, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-4 py-3.5 bg-white border border-pop-border rounded-xl shadow-pop"
              >
                <div className="text-[12px] font-semibold text-pop-muted min-w-[110px]">
                  {row.who}
                </div>
                <svg width="24" height="12" viewBox="0 0 24 12" fill="none">
                  <line
                    x1="0"
                    y1="6"
                    x2="20"
                    y2="6"
                    stroke={row.color}
                    strokeWidth="1.5"
                  />
                  <polygon points="16,3 24,6 16,9" fill={row.color} />
                </svg>
                <div className="flex-1">
                  <div className="text-[12px] font-semibold text-pop-black">
                    {row.to}
                  </div>
                  <div className="text-[11px] text-pop-muted">{row.note}</div>
                </div>
              </div>
            ))}
            <div className="px-4 py-3 bg-white border border-pop-border rounded-xl shadow-pop">
              <div className="flex items-center gap-2">
                <ShieldIcon />
                <span className="text-[13px] text-pop-muted">
                  RepoFox servers:{" "}
                  <strong className="text-pop-black">
                    not in the data path
                  </strong>
                </span>
              </div>
            </div>
          </div>
        </FeatureRow>
      </div>
    </section>
  );
}
