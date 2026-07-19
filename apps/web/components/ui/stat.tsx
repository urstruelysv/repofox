import React from 'react'

interface StatProps {
  num: string
  label: string
  sub?: string
}

export function Stat({ num, label, sub }: StatProps) {
  return (
    <div className="text-center">
      <div className="text-[clamp(32px,5vw,40px)] font-medium tracking-[-1.9px] text-pop-black leading-none mb-2">
        {num}
      </div>
      <div className="text-[14px] font-bold text-pop-black leading-tight mb-1">{label}</div>
      {sub && <div className="text-[12px] text-pop-muted leading-snug">{sub}</div>}
    </div>
  )
}
