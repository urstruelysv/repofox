"use client";

import { useState, useEffect, useRef } from "react";

// ─── Tab config ───────────────────────────────────────────────────────────────

type TabId = "vscode" | "cursor" | "terminal" | "jetbrains";

interface Tab {
  id: TabId;
  label: string;
  heading: string;
  description: string;
  action: { label: string; href: string; mono?: boolean };
  secondary?: { label: string; href: string };
  bgColor: string; // panel background
  bgAccent: string; // decorative lines / pattern accent
  screenshot: string; // path in /public/screenshots/
  screenshotAlt: string;
}

const TABS: Tab[] = [
  {
    id: "vscode",
    label: "VS Code",
    heading: "RepoFox in VS Code",
    description:
      "The full branch → PR pipeline lives in the VS Code sidebar. One click. AI names the branch, writes the commit, opens the PR. Every step is recorded in Operations History with a revert button.",
    action: {
      label: "ext install repofox.repofox",
      href: "https://marketplace.visualstudio.com/items?itemName=repofox.repofox",
      mono: true,
    },
    secondary: {
      label: "View on Marketplace",
      href: "https://marketplace.visualstudio.com/items?itemName=repofox.repofox",
    },
    bgColor: "rgb(245, 249, 255)",
    bgAccent: "rgba(59, 130, 246, 0.1)",
    screenshot: "/screenshots/vscode.png",
    screenshotAlt:
      "RepoFox sidebar in VS Code showing Branch → PR button and Operations History",
  },
  {
    id: "cursor",
    label: "Cursor",
    heading: "RepoFox in Cursor",
    description:
      "Cursor writes the code with AI. RepoFox ships it. The VS Code extension installs identically in Cursor — same sidebar, same pipeline, same snapshot system. A Cursor-native version with Composer context awareness is planned for v0.3.",
    action: {
      label: "ext install repofox.repofox",
      href: "https://marketplace.visualstudio.com/items?itemName=repofox.repofox",
      mono: true,
    },
    secondary: {
      label: "Read the docs",
      href: "https://docs.repofox.dev/extensions/cursor",
    },
    bgColor: "rgb(240, 253, 244)",
    bgAccent: "rgba(34, 197, 94, 0.1)",
    screenshot: "/screenshots/cursor.png",
    screenshotAlt: "RepoFox sidebar running inside Cursor IDE",
  },
  {
    id: "terminal",
    label: "CLI",
    heading: "RepoFox in the terminal",
    description:
      "The RepoFox CLI brings the same AI-powered workflow to your terminal. Run it in CI/CD pipelines, SSH sessions, or anywhere without a GUI. Ships as a single binary — no runtime, no dependencies.",
    action: {
      label: "curl -fsSL https://repofox.dev/install.sh | sh",
      href: "https://docs.repofox.dev/cli",
      mono: true,
    },
    secondary: {
      label: "CLI reference",
      href: "https://docs.repofox.dev/cli",
    },
    bgColor: "rgb(250, 250, 250)",
    bgAccent: "rgba(0, 0, 0, 0.03)",
    screenshot: "/screenshots/terminal.png",
    screenshotAlt: "RepoFox CLI running branch → PR workflow in a terminal",
  },
  {
    id: "jetbrains",
    label: "JetBrains",
    heading: "RepoFox for JetBrains",
    description:
      "IntelliJ IDEA, WebStorm, GoLand — RepoFox is coming to the JetBrains ecosystem in v1.0. Join the waitlist to be first when it ships. The CLI works today in any editor's built-in terminal.",
    action: {
      label: "Join the waitlist",
      href: "mailto:team@repofox.dev?subject=JetBrains+Waitlist",
    },
    secondary: {
      label: "Use CLI in the meantime",
      href: "https://docs.repofox.dev/cli",
    },
    bgColor: "rgb(255, 251, 235)",
    bgAccent: "rgba(245, 158, 11, 0.1)",
    screenshot: "/screenshots/jetbrains.png",
    screenshotAlt: "RepoFox coming to JetBrains IDEs",
  },
];

// ─── Decorative wavy lines ────────────────────

function WavyLines({ color }: { color: string }) {
  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 w-full h-full opacity-30 pointer-events-none"
      preserveAspectRatio="xMidYMid slice"
    >
      {[0, 60, 120, 180, 240, 300, 360, 420].map((y, i) => (
        <path
          key={i}
          d={`M -100 ${y} Q 200 ${y - 30} 500 ${y + 15} Q 800 ${y + 45} 1100 ${y - 20} Q 1400 ${y - 50} 1700 ${y + 10}`}
          fill="none"
          stroke={color}
          strokeWidth="1"
        />
      ))}
    </svg>
  );
}

// ─── Screenshot placeholder ───────────

function ScreenshotPlaceholder({
  tab,
  isVisible,
}: {
  tab: Tab;
  isVisible: boolean;
}) {
  const isCLI = tab.id === "terminal";
  const isJetBrains = tab.id === "jetbrains";
  const isVSCode = tab.id === "vscode";

  return (
    <div
      className={`w-full max-w-[680px] rounded-xl overflow-hidden border border-pop-border bg-white shadow-pop relative transition-all duration-500 ${
        isVisible
          ? "translate-y-0 scale-100 opacity-100"
          : "translate-y-4 scale-[0.98] opacity-0"
      }`}
    >
      {/* Title bar */}
      <div className="flex items-center gap-1.5 px-4 py-2.5 bg-pop-gray-100 border-b border-pop-border">
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
          <div
            key={c}
            className="w-[11px] h-[11px] rounded-full"
            style={{ background: c }}
          />
        ))}
        <span className="ml-2.5 text-[12px] text-pop-muted">
          {isCLI
            ? "zsh — repofox"
            : isJetBrains
              ? "IntelliJ IDEA"
              : isVSCode
                ? "Visual Studio Code"
                : "Cursor"}
        </span>
      </div>

      {/* Content Mockups */}
      {isCLI ? (
        <CLIMockup />
      ) : isJetBrains ? (
        <JetBrainsMockup />
      ) : (
        <IDEMockup tab={tab} />
      )}
    </div>
  );
}

function IDEMockup({ tab: _tab }: { tab: Tab }) {
  return (
    <div className="flex h-[380px] bg-white font-sans">
      {/* Activity bar */}
      <div className="w-11 bg-pop-gray-100 border-r border-pop-border flex flex-col items-center pt-3 gap-4">
        {[
          <path
            key="files"
            d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />,
          <path
            key="search"
            d="M11 17.5A6.5 6.5 0 1 0 11 4.5a6.5 6.5 0 0 0 0 13zm5.5 1.5 3 3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />,
          <path
            key="git"
            d="M6 3v12M18 6a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM6 18a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />,
        ].map((path, i) => (
          <div
            key={i}
            className={`relative ${i === 2 ? "text-primary" : "text-pop-gray-400"}`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              {path}
            </svg>
            {i === 2 && (
              <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-primary" />
            )}
          </div>
        ))}
      </div>

      {/* Sidebar panel */}
      <div className="w-[200px] bg-white border-r border-pop-border p-2.5 overflow-hidden">
        <div className="text-[9px] font-bold text-pop-muted tracking-widest uppercase mb-2">
          REPOFOX
        </div>

        {/* Button */}
        <div className="flex rounded-md overflow-hidden border border-pop-border h-[30px] mb-2 shadow-sm">
          <div className="flex-1 bg-primary flex items-center gap-1 px-2.5 text-[11px] font-semibold text-white">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Branch → PR
          </div>
          <div className="w-[1px] bg-white/20" />
          <div className="w-[26px] bg-primary flex items-center justify-center">
            <svg
              width="9"
              height="9"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#fff"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>

        {/* Status row */}
        <div className="flex items-center gap-1 mb-3">
          <div className="w-1 h-1 rounded-full bg-green-500 shadow-[0_0_4px_#22c55e]" />
          <span className="text-[9.5px] text-pop-muted flex-1 truncate">
            groq · llama-3.3-70b
          </span>
          <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
            feat/auth
          </span>
        </div>

        {/* Ops history label */}
        <div className="text-[8.5px] font-bold text-pop-muted tracking-widest uppercase mb-1.5">
          Operations history
        </div>

        {/* Op cards */}
        {[
          {
            label: "Branch created",
            detail: "feat/add-jwt-middleware",
            done: true,
          },
          {
            label: "Staged 3 files",
            detail: "auth.ts · middleware.ts",
            done: true,
          },
          {
            label: "Committed",
            detail: "feat(auth): add JWT…",
            done: true,
          },
          {
            label: "Pushed → origin",
            detail: "feat/add-jwt-middleware",
            active: true,
          },
        ].map((op, i) => (
          <div
            key={i}
            className={`rounded-md border p-1.5 mb-1 bg-white ${
              op.active ? "border-primary/40" : "border-pop-border"
            }`}
          >
            <div className="flex items-center gap-1.5 mb-0.5">
              <div
                className={`w-3 h-3 rounded bg-pop-gray-100 flex items-center justify-center ${
                  op.active ? "text-primary" : "text-green-600"
                }`}
              >
                {op.done ? (
                  <svg
                    width="7"
                    height="7"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <div className="w-1 h-1 rounded-full bg-primary" />
                )}
              </div>
              <span className="text-[10px] font-semibold text-pop-black truncate">
                {op.label}
              </span>
            </div>
            <div className="text-[9px] text-pop-muted font-mono pl-4">
              {op.detail}
            </div>
          </div>
        ))}
      </div>

      {/* Editor area — diff preview */}
      <div className="flex-1 p-4 text-[11.5px] leading-[1.8] font-mono">
        <div className="text-neutral-400 mb-2 text-[10px]">
          src/auth/middleware.ts
        </div>
        {[
          {
            c: "#a0a0ab",
            t: "  1  import { verify } from 'jsonwebtoken'",
          },
          {
            c: "#a0a0ab",
            t: "  2  import type { Request, Response, NextFunction }",
          },
          { c: "#a0a0ab", t: "  3  " },
          { c: "#22c55e", t: "+ 4  export function jwtMiddleware(" },
          {
            c: "#22c55e",
            t: "+ 5    req: Request, res: Response, next: NextFunction",
          },
          { c: "#22c55e", t: "+ 6  ) {" },
          {
            c: "#22c55e",
            t: "+ 7    const token = req.headers.authorization",
          },
          {
            c: "#22c55e",
            t: "+ 8    if (!token) return res.status(401).json({})",
          },
          {
            c: "#22c55e",
            t: "+ 9    try { verify(token, process.env.JWT_SECRET!)",
          },
          { c: "#a0a0ab", t: " 10    next()" },
        ].map((line, i) => (
          <div
            key={i}
            className={`pl-1 rounded ${line.c === "#22c55e" ? "bg-green-50" : ""}`}
            style={{ color: line.c }}
          >
            {line.t}
          </div>
        ))}
      </div>
    </div>
  );
}

function CLIMockup() {
  return (
    <div className="p-5 min-h-[340px] font-mono text-[12.5px] leading-[1.75] bg-pop-gray-100 text-pop-black">
      {[
        { c: "#a0a0ab", t: "~/my-project on main" },
        { c: "#171717", t: "$ repofox run" },
        { c: "", t: "" },
        {
          c: "#3b82f6",
          t: "  ▸ Reading repo history (50 commits, 10 branches)…",
        },
        { c: "#10b981", t: "  ✓ Context built" },
        { c: "", t: "" },
        { c: "#3b82f6", t: "  ▸ Generating branch name…" },
        { c: "#171717", t: "  Branch name [feat/add-jwt-middleware]: " },
        { c: "#a0a0ab", t: "    (press Enter to accept)" },
        { c: "", t: "" },
        { c: "#10b981", t: "  ✓ Branch created: feat/add-jwt-middleware" },
        { c: "#10b981", t: "  ✓ Staged 3 files" },
        { c: "", t: "" },
        { c: "#3b82f6", t: "  ▸ Generating commit message…" },
        { c: "#171717", t: "  feat(auth): add JWT middleware and type guards" },
        { c: "#10b981", t: "  ✓ Committed" },
        { c: "#10b981", t: "  ✓ Pushed → origin" },
        { c: "#10b981", t: "  ✓ PR #47 opened" },
        { c: "", t: "" },
        { c: "#a0a0ab", t: "  https://github.com/you/repo/pull/47" },
      ].map((l, i) => (
        <div key={i} style={{ color: l.c }}>
          {l.t || <>&nbsp;</>}
        </div>
      ))}
    </div>
  );
}

function JetBrainsMockup() {
  return (
    <div className="flex h-[380px] bg-white font-sans">
      {/* Left panel */}
      <div className="w-[200px] bg-pop-gray-100 border-r border-pop-border p-3">
        <div className="text-[10px] text-pop-muted mb-3 font-bold uppercase tracking-wider">
          Project ▾
        </div>
        {[
          "src",
          "├── auth",
          "│   ├── jwt.ts",
          "│   └── middleware.ts",
          "├── api",
          "└── index.ts",
        ].map((f, i) => (
          <div
            key={i}
            className={`text-[11px] font-mono leading-[1.8] ${i === 2 ? "text-primary" : "text-pop-muted"}`}
          >
            {f}
          </div>
        ))}
      </div>

      {/* Main area */}
      <div className="flex-1 p-6 flex flex-col gap-4">
        <div className="text-center pt-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-50 text-amber-500 mb-4 shadow-sm">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <div className="text-[16px] font-bold text-pop-black mb-2">
            Coming in v1.0
          </div>
          <div className="text-[13px] text-pop-muted leading-relaxed max-w-[280px] mx-auto">
            Full RepoFox plugin for IntelliJ IDEA, WebStorm, GoLand, and all
            JetBrains IDEs.
          </div>
          <div className="mt-5">
            <div className="inline-block px-5 py-2 rounded-full bg-amber-500 text-white text-[12px] font-bold cursor-pointer hover:bg-amber-600 transition-colors">
              Join the waitlist →
            </div>
          </div>
        </div>

        <div className="mt-auto p-3 bg-pop-gray-100 border border-pop-border rounded-xl">
          <div className="text-[11px] text-pop-muted mb-1">
            Use the CLI in the meantime
          </div>
          <div className="font-mono text-[11px] text-primary">
            repofox run --ci
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Copy button ────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      onClick={copy}
      title="Copy"
      className={`bg-transparent border-none cursor-pointer transition-colors p-1 rounded ${
        copied
          ? "text-green-600"
          : "text-pop-muted hover:text-pop-black"
      }`}
    >
      {copied ? (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

// ─── Main section ─────────────────────

export function WorksEverywhere() {
  const [active, setActive] = useState<TabId>("vscode");
  const [panelVisible, setPanelVisible] = useState(true);
  const [isAnimating, setIsAnimating] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const tab = TABS.find((t) => t.id === active)!;

  const switchTo = (id: TabId) => {
    if (id === active || isAnimating) return;
    setIsAnimating(true);
    setPanelVisible(false);
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setActive(id);
      setPanelVisible(true);
      setTimeout(() => setIsAnimating(false), 550);
    }, 200);
  };

  // Auto-cycle through tabs
  useEffect(() => {
    const interval = setInterval(() => {
      const next =
        TABS[(TABS.findIndex((t) => t.id === active) + 1) % TABS.length]!.id;
      switchTo(next);
    }, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <section className="py-24 px-6 bg-white border-t border-pop-border">
      {/* ── Section header ── */}
      <div className="text-center mb-10">
        <p className="text-[19px] text-pop-muted tracking-[-0.01em] mb-7">
          Use RepoFox where you work
        </p>

        {/* ── Pill tabs ── */}
        <div className="inline-flex gap-1 bg-pop-gray-100 border border-pop-border rounded-full p-1 shadow-sm">
          {TABS.map((t) => {
            const isActive = t.id === active;
            return (
              <button
                key={t.id}
                onClick={() => switchTo(t.id)}
                className={`px-[18px] py-1.5 rounded-full border-none text-[13px] font-medium cursor-pointer transition-all duration-300 tracking-tight whitespace-nowrap ${
                  isActive
                    ? "bg-white text-pop-black shadow-sm"
                    : "bg-transparent text-pop-muted hover:text-pop-black"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Colored panel with screenshot ── */}
      <div
        className="mx-[clamp(0px,3vw,48px)] rounded-3xl overflow-hidden relative min-h-[460px] flex items-center justify-center p-[clamp(36px,5vw,64px)] transition-all duration-500 border border-pop-border shadow-pop"
        style={{ background: tab.bgColor }}
      >
        {/* Wavy lines decoration */}
        <WavyLines color={tab.bgAccent} />

        {/* Screenshot — centred, animated on tab switch */}
        <div className="relative z-10 w-full flex justify-center">
          <ScreenshotPlaceholder tab={tab} isVisible={panelVisible} />
        </div>
      </div>

      {/* ── Bottom: title + description + action ── */}
      <div className="flex gap-[clamp(24px,4vw,80px)] px-[clamp(0px,3vw,48px)] pt-[clamp(32px,5vw,52px)] flex-wrap items-start">
        {/* Title */}
        <div
          className={`shrink-0 transition-all duration-400 ${
            panelVisible
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-2"
          }`}
        >
          <h2 className="text-[clamp(26px,3.5vw,38px)] font-medium tracking-[-1.9px] text-pop-black leading-[1.15]">
            {tab.heading}
          </h2>
        </div>

        {/* Description + install */}
        <div
          className={`flex-1 min-w-[260px] transition-all duration-400 delay-75 ${
            panelVisible
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-2"
          }`}
        >
          <p className="text-[15px] text-pop-muted leading-relaxed tracking-[-0.45px] mb-5 max-w-[480px]">
            {tab.description}
          </p>

          {/* Action row */}
          <div className="flex items-center gap-3 flex-wrap">
            {tab.action.mono ? (
              /* Mono install command */
              <div className="inline-flex items-center gap-2.5 px-3.5 py-2 bg-pop-gray-100 border border-pop-border rounded-lg font-mono text-[13px] text-pop-muted max-w-full overflow-hidden shadow-sm">
                <span className="truncate">{tab.action.label}</span>
                <CopyButton text={tab.action.label} />
              </div>
            ) : (
              /* Regular CTA button */
              <a
                href={tab.action.href}
                className="pop-button pop-button-primary h-11 px-5 !text-[13px] gap-2"
              >
                {tab.action.label}
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </a>
            )}

            {/* Secondary link */}
            {tab.secondary && (
              <a
                href={tab.secondary.href}
                className="text-[13px] text-pop-muted no-underline transition-colors hover:text-primary"
              >
                {tab.secondary.label} →
              </a>
            )}
          </div>
        </div>
      </div>

      {/* ── Progress indicators (dots) ── */}
      <div className="flex justify-center gap-2 mt-8">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => switchTo(t.id)}
            className={`h-1.5 rounded-full border-none cursor-pointer p-0 transition-all duration-300 ${
              t.id === active ? "w-5 bg-primary" : "w-1.5 bg-pop-gray-400"
            }`}
          />
        ))}
      </div>
    </section>
  );
}
