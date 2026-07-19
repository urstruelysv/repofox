import React from 'react'

interface PipeStepProps {
  n: string
  label: string
  ai: boolean
  active: boolean
}

export function PipeStep({ n, label, ai, active }: PipeStepProps) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-300 ${
        active
          ? 'bg-primary/5 border-primary/30 shadow-pop'
          : 'bg-white border-pop-border'
      }`}
    >
      <div
        className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold font-mono transition-all duration-300 border ${
          active ? 'bg-primary border-primary text-white' : 'bg-pop-gray-100 border-pop-border text-pop-muted'
        }`}
      >
        {n}
      </div>
      <span
        className={`text-[13px] font-medium flex-1 transition-all duration-300 ${
          active ? 'text-pop-black' : 'text-pop-muted'
        }`}
      >
        {label}
      </span>
      {ai && (
        <span
          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider transition-all duration-300 ${
            active ? 'bg-primary text-white' : 'bg-pop-gray-100 text-pop-muted'
          }`}
        >
          AI
        </span>
      )}
    </div>
  )
}
