"use client";

import React, { useState, useEffect } from "react";
import { RevertIcon } from "@/components/ui/icons";
import { PipeStep } from "@/components/ui/pipe-step";
import { SnapshotCard } from "@/components/ui/snapshot-card";

const STEPS = [
  { n: "01", label: "Build context from git history", ai: true },
  { n: "02", label: "Suggest branch name from conventions", ai: true },
  { n: "03", label: "Stage files and generate commit", ai: true },
  { n: "04", label: "Safe push with --set-upstream", ai: false },
  { n: "05", label: "Open an editable PR draft", ai: true },
];

export function Pipeline() {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setActiveStep((s) => (s + 1) % 5), 1600);
    return () => clearInterval(t);
  }, []);

  return (
    <section
      id="pipeline"
      className="bg-white py-24 px-6 border-t border-pop-border"
    >
      <div className="max-w-[1120px] mx-auto">
        <div className="mb-16">
          <div className="text-[11px] font-bold tracking-[0.1em] uppercase text-primary mb-3.5">
            The pipeline
          </div>
          <h2 className="text-[clamp(28px,4vw,38px)] font-medium tracking-[-1.9px] leading-[1.1] text-pop-black max-w-[520px]">
            Every step is shown. Every step is revertible.
          </h2>
        </div>

        <div className="flex gap-[clamp(32px,5vw,80px)] flex-wrap items-start">
          {/* Steps list */}
          <div className="flex-1 min-w-[280px] flex flex-col gap-2">
            {STEPS.map((s, i) => (
              <div key={i}>
                <PipeStep {...s} active={activeStep === i} />
              </div>
            ))}
            <div className="mt-4 px-4 py-3 bg-green-500/5 border border-green-500/10 rounded-xl">
              <div className="text-[11px] text-green-600 font-bold mb-1 uppercase tracking-wider">
                Result
              </div>
              <div className="text-[13px] text-pop-muted font-mono">
                PR draft ready · review in VS Code Markdown editor
              </div>
            </div>
          </div>

          {/* Snapshot system callout */}
          <div className="flex-1 min-w-[280px] max-w-[400px]">
            <div className="bg-white border border-pop-border rounded-2xl p-6 sticky top-20 shadow-pop-xl">
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center text-green-600">
                  <RevertIcon />
                </div>
                <div>
                  <div className="text-[14px] font-bold text-pop-black">
                    Operations History
                  </div>
                  <div className="text-[11px] text-pop-muted">
                    Every step · fully revertible
                  </div>
                </div>
              </div>
              <SnapshotCard
                label="Branch created"
                detail="feat/add-jwt-middleware"
                done={true}
              />
              <SnapshotCard
                label="Staged 3 files"
                detail="auth.ts · types.ts · middleware.ts"
                done={true}
              />
              <SnapshotCard
                label="Committed"
                detail="feat(auth): add JWT middleware"
                done={true}
              />
              <SnapshotCard
                label="Pushed"
                detail="feat/add-jwt-middleware"
                done={true}
              />
              <SnapshotCard
                label="PR draft ready"
                detail="review before explicit submit"
                done={false}
                accent
              />
              <div className="mt-4 px-3.5 py-2.5 bg-pop-gray-100 border border-pop-border rounded-lg">
                <div className="text-[10px] text-pop-muted font-bold mb-1 uppercase tracking-wider">
                  Snapshot storage
                </div>
                <code className="text-[11px] text-primary font-mono">
                  .git/refs/repofox/snapshots/
                </code>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
