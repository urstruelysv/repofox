import React from 'react'

interface FeatureRowProps {
  eyebrow: string
  headline: string
  body: string
  reverse?: boolean
  children: React.ReactNode
}

export function FeatureRow({ eyebrow, headline, body, reverse = false, children }: FeatureRowProps) {
  return (
    <div
      className={`flex gap-[clamp(40px,6vw,100px)] items-center flex-wrap ${
        reverse ? 'flex-row-reverse' : 'flex-row'
      }`}
    >
      <div className="flex-1 min-w-[280px]">
        <div className="text-[11px] font-bold tracking-[0.1em] uppercase text-primary mb-3.5">
          {eyebrow}
        </div>
        <h3 className="text-[clamp(24px,3.5vw,38px)] font-medium tracking-[-1.9px] leading-[1.2] text-pop-black mb-4">
          {headline}
        </h3>
        <p className="text-[15px] text-pop-muted leading-[1.6] tracking-[-0.45px] max-w-[420px]">
          {body}
        </p>
      </div>
      <div className="flex-1 min-w-[300px]">
        {children}
      </div>
    </div>
  )
}
