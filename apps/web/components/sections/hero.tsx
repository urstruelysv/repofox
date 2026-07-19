import React from 'react'
import { CodeIcon } from '@/components/ui/icons'

export function Hero() {
  return (
    <section
      className="bg-radial-top pt-[clamp(120px,16vh,200px)] pb-[clamp(80px,10vh,140px)] px-6 relative overflow-hidden"
    >
      <div className="max-w-[1120px] mx-auto flex items-center">
        <div className="max-w-[600px]">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-secondary/20 bg-secondary/5 mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <span className="bg-secondary text-white text-[10px] font-bold px-2 py-0.5 rounded-full tracking-wider uppercase">
              Open Source
            </span>
            <span className="text-[12px] text-secondary font-medium">AGPLv3 · Free for individuals</span>
          </div>

          {/* Headline */}
          <h1 className="text-[clamp(48px,6vw,72px)] font-medium tracking-[-2.32px] leading-[1.05] text-neutral-100 mb-6 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
            Make shipping as fast as coding.
          </h1>

          {/* Sub */}
          <p className="text-[19px] text-neutral-400 leading-[1.5] tracking-[-0.57px] mb-10 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
            Branch to merged PR in one click. AI-driven. Fully reversible. Without leaving VS Code.
          </p>

          {/* CTAs */}
          <div className="flex gap-3 flex-wrap items-center animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
            <a
              href="https://marketplace.visualstudio.com/items?itemName=repofox.repofox"
              className="btn-pill btn-primary gap-2 h-14 px-8 shadow-pop-lg hover:-translate-y-0.5"
            >
              <CodeIcon /> Install for VS Code — Free
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
