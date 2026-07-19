'use client'

import React, { useState } from 'react'

interface FAQItemProps {
  q: string
  a: string
}

export function FAQItem({ q, a }: FAQItemProps) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-pop-border overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex justify-between items-center py-5 bg-transparent border-none cursor-pointer text-left transition-colors"
      >
        <span
          className={`text-[15px] font-bold transition-colors ${
            open ? 'text-pop-black' : 'text-pop-muted'
          }`}
        >
          {q}
        </span>
        <span
          className={`text-[20px] text-pop-muted shrink-0 ml-4 transition-all duration-300 ${
            open ? 'rotate-45' : 'rotate-0'
          }`}
        >
          +
        </span>
      </button>
      <div
        className={`transition-all duration-500 ease-in-out ${
          open ? 'max-h-[300px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <p className="text-[14px] text-pop-muted leading-relaxed pb-5 tracking-[-0.45px]">{a}</p>
      </div>
    </div>
  )
}
