"use client";

import React from "react";

import { vsixUrl } from "@/lib/repo-links";

export function Hero() {
  return (
    <section className="pt-[100px] pb-20 px-6 text-center bg-white overflow-hidden">
      <div className="max-w-[1100px] mx-auto">
        {/* Badge */}
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-pop-border bg-white shadow-sm mb-9"
          style={{ animation: "heroFadeUp 0.5s ease 0.1s both" }}
        >
          <span className="bg-primary text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full tracking-wider uppercase">
            New
          </span>
          <span className="text-[12px] text-pop-muted font-medium">
            OpenAI Build Week · Developer Tools
          </span>
        </div>

        {/* Headline — 500 weight, black, Pop Site scale */}
        <h1
          style={{
            fontSize: "clamp(64px, 12vw, 120px)",
            lineHeight: 0.9,
            letterSpacing: "-0.05em",
            animation: "heroFadeUp 0.55s ease 0.2s both",
          }}
          className="font-medium text-pop-black mb-6"
        >
          From finished change
          <br />
          to <span className="text-primary">review-ready PR</span>
        </h1>

        {/* Sub */}
        <p
          className="text-[16px] text-pop-muted leading-relaxed mb-10 max-w-[480px] mx-auto font-medium"
          style={{ animation: "heroFadeUp 0.55s ease 0.32s both" }}
        >
          RepoFox guides branch, commit, push, and an editable PR draft inside
          VS Code. You approve every meaningful decision.
        </p>

        {/* CTA */}
        <div
          className="flex flex-col items-center gap-3 mb-16"
          style={{ animation: "heroFadeUp 0.5s ease 0.44s both" }}
        >
          <a
            href={vsixUrl}
            className="pop-button pop-button-primary px-8 py-4 text-[15px] font-semibold shadow-pop hover:-translate-y-0.5 transition-all"
          >
            Download VSIX
          </a>
          <span className="text-[12px] text-pop-muted">
            VS Code 1.85+ · install without rebuilding the repository
          </span>
        </div>

        {/* Git graph visual */}
        <div style={{ animation: "heroFadeUp 0.6s ease 0.56s both" }}>
          <GitGraph />
        </div>
      </div>

      <style>{`
        @keyframes heroFadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes drawLine {
          to { stroke-dashoffset: 0; }
        }
        @keyframes nodePopIn {
          from { opacity: 0; transform: scale(0.2); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes prPop {
          0%   { opacity: 0; transform: scale(0.5) translateY(6px); }
          60%  { opacity: 1; transform: scale(1.06) translateY(-2px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes chipFade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
    </section>
  );
}

function GitGraph() {
  return (
    <div className="bg-pop-gray-100 border border-pop-border rounded-2xl p-10 max-w-[780px] mx-auto relative overflow-hidden">
      {/* top shimmer line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

      <div className="text-[11px] font-bold tracking-[0.1em] uppercase text-pop-muted mb-7 text-left">
        Your workflow, visualized
      </div>

      <svg
        viewBox="0 0 700 200"
        className="w-full"
        style={{ height: 200, overflow: "visible" }}
      >
        <defs>
          <filter id="rf-glow-i">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="rf-glow-g">
            <feGaussianBlur stdDeviation="2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Lines */}
        <path
          d="M 40 100 L 620 100"
          fill="none"
          stroke="#e4e4e7"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="1000"
          strokeDashoffset="1000"
          style={{ animation: "drawLine 1s ease 0.9s forwards" }}
        />
        <path
          d="M 160 100 Q 190 100 210 70 L 400 70 Q 420 70 440 100"
          fill="none"
          stroke="#4F46E5"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="1000"
          strokeDashoffset="1000"
          style={{ animation: "drawLine 0.7s ease 1.3s forwards" }}
        />
        <path
          d="M 300 100 Q 325 100 345 135 L 480 135 Q 500 135 520 100"
          fill="none"
          stroke="#10b981"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="1000"
          strokeDashoffset="1000"
          style={{ animation: "drawLine 0.5s ease 1.7s forwards" }}
        />

        {/* Main branch nodes */}
        {[
          { cx: 40, delay: "0.85s", color: "#e4e4e7" },
          { cx: 160, delay: "1.0s", color: "#e4e4e7" },
          { cx: 300, delay: "1.15s", color: "#e4e4e7" },
          { cx: 620, delay: "2.55s", color: "#e4e4e7" },
        ].map(({ cx, delay, color }) => (
          <g
            key={cx}
            style={{
              transformOrigin: `${cx}px 100px`,
              opacity: 0,
              animation: `nodePopIn 0.3s ease ${delay} forwards`,
            }}
          >
            <circle
              cx={cx}
              cy={100}
              r={7}
              fill="#fff"
              stroke={color}
              strokeWidth={2}
            />
          </g>
        ))}

        {/* Merge nodes */}
        <g
          style={{
            transformOrigin: "440px 100px",
            opacity: 0,
            animation: "nodePopIn 0.3s ease 1.95s forwards",
          }}
        >
          <circle
            cx={440}
            cy={100}
            r={8}
            fill="#4F46E5"
            filter="url(#rf-glow-i)"
          />
          <circle cx={440} cy={100} r={4} fill="#fff" />
        </g>
        <g
          style={{
            transformOrigin: "520px 100px",
            opacity: 0,
            animation: "nodePopIn 0.3s ease 2.35s forwards",
          }}
        >
          <circle
            cx={520}
            cy={100}
            r={8}
            fill="#10b981"
            filter="url(#rf-glow-g)"
          />
          <circle cx={520} cy={100} r={4} fill="#fff" />
        </g>

        {/* Feat commits */}
        {[250, 330, 400].map((cx, i) => (
          <g
            key={cx}
            style={{
              transformOrigin: `${cx}px 70px`,
              opacity: 0,
              animation: `nodePopIn 0.3s ease ${1.3 + i * 0.2}s forwards`,
            }}
          >
            <circle
              cx={cx}
              cy={70}
              r={7}
              fill="#fff"
              stroke="#4F46E5"
              strokeWidth={2}
            />
          </g>
        ))}

        {/* Fix commits */}
        {[380, 460].map((cx, i) => (
          <g
            key={cx}
            style={{
              transformOrigin: `${cx}px 135px`,
              opacity: 0,
              animation: `nodePopIn 0.3s ease ${1.75 + i * 0.2}s forwards`,
            }}
          >
            <circle
              cx={cx}
              cy={135}
              r={7}
              fill="#fff"
              stroke="#10b981"
              strokeWidth={2}
            />
          </g>
        ))}

        {/* Chips */}
        <g
          style={{ opacity: 0, animation: "chipFade 0.3s ease 1.35s forwards" }}
        >
          <rect x={210} y={44} width={72} height={18} rx={9} fill="#e3e2ff" />
          <text
            x={246}
            y={57}
            textAnchor="middle"
            fontFamily="monospace"
            fontSize={9}
            fill="#4F46E5"
          >
            feat/auth
          </text>
        </g>
        <g
          style={{ opacity: 0, animation: "chipFade 0.3s ease 1.55s forwards" }}
        >
          <rect x={291} y={44} width={76} height={18} rx={9} fill="#e3e2ff" />
          <text
            x={329}
            y={57}
            textAnchor="middle"
            fontFamily="monospace"
            fontSize={9}
            fill="#4F46E5"
          >
            add login
          </text>
        </g>
        <g
          style={{ opacity: 0, animation: "chipFade 0.3s ease 1.8s forwards" }}
        >
          <rect x={342} y={150} width={76} height={18} rx={9} fill="#d1fae5" />
          <text
            x={380}
            y={163}
            textAnchor="middle"
            fontFamily="monospace"
            fontSize={9}
            fill="#059669"
          >
            fix/tokens
          </text>
        </g>

        {/* main label */}
        <g
          style={{ opacity: 0, animation: "chipFade 0.3s ease 1.05s forwards" }}
        >
          <rect x={20} y={78} width={36} height={16} rx={8} fill="#f5f5f5" />
          <text
            x={38}
            y={90}
            textAnchor="middle"
            fontFamily="Inter,sans-serif"
            fontSize={9}
            fontWeight={600}
            fill="#a0a0ab"
          >
            main
          </text>
        </g>

        {/* PR badge — hero moment */}
        <g
          style={{
            transformOrigin: "586px 60px",
            opacity: 0,
            animation:
              "prPop 0.5s cubic-bezier(0.34,1.56,0.64,1) 2.6s forwards",
          }}
        >
          <rect
            x={530}
            y={44}
            width={122}
            height={32}
            rx={16}
            fill="#4F46E5"
            filter="url(#rf-glow-i)"
          />
          <text
            x={591}
            y={64}
            textAnchor="middle"
            fontFamily="Inter,sans-serif"
            fontSize={12}
            fontWeight={700}
            fill="white"
          >
            ✓ Draft ready
          </text>
          <line
            x1={591}
            y1={76}
            x2={600}
            y2={93}
            stroke="#4F46E5"
            strokeWidth={1.5}
            strokeDasharray="3,2"
            opacity={0.5}
          />
        </g>
        <g
          style={{
            opacity: 0,
            animation:
              "prPop 0.5s cubic-bezier(0.34,1.56,0.64,1) 2.6s forwards",
          }}
        >
          <rect x={548} y={158} width={86} height={18} rx={9} fill="#e3e2ff" />
          <text
            x={591}
            y={171}
            textAnchor="middle"
            fontFamily="Inter,sans-serif"
            fontSize={9}
            fontWeight={600}
            fill="#4F46E5"
          >
            you approve ↑
          </text>
        </g>
      </svg>

      {/* Stats */}
      <div
        className="flex justify-center gap-10 mt-7 pt-6 border-t border-pop-border"
        style={{ opacity: 0, animation: "heroFadeUp 0.5s ease 2.9s both" }}
      >
        {[
          {
            num: "VS Code",
            label: "single supported surface",
            color: "text-pop-muted",
          },
          {
            num: "Review",
            label: "before every mutation",
            color: "text-primary",
          },
          {
            num: "History",
            label: "persisted locally",
            color: "text-pop-muted",
          },
        ].map(({ num, label, color }, i) => (
          <React.Fragment key={num}>
            {i > 0 && <div className="w-px bg-pop-border" />}
            <div className="text-center">
              <div
                className={`text-[22px] font-extrabold tracking-tight ${color || "text-pop-black"}`}
              >
                {num}
              </div>
              <div className="text-[12px] text-pop-muted font-medium mt-0.5">
                {label}
              </div>
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
