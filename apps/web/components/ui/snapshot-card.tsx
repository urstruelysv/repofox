import React from 'react'
import { CheckIcon, RevertIcon } from '@/components/ui/icons'

interface SnapshotCardProps {
  label: string
  detail: string
  done: boolean
  accent?: boolean
}

export function SnapshotCard({ label, detail, done, accent = false }: SnapshotCardProps) {
  return (
    <div
      className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl border mb-2 shadow-pop transition-all ${
        accent ? 'bg-primary/5 border-primary/30' : 'bg-white border-pop-border'
      }`}
    >
      <div
        className={`w-5 h-5 rounded flex shrink-0 items-center justify-center ${
          accent ? 'bg-primary text-white' : 'bg-green-500/10 text-green-600'
        }`}
      >
        {done ? <CheckIcon className="scale-75" /> : <RevertIcon className="scale-75" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-bold text-pop-black">{label}</div>
        <div
          className="text-[11px] text-pop-muted font-mono overflow-hidden truncate"
        >
          {detail}
        </div>
      </div>
      {done && (
        <button
          className="text-[10px] px-2 py-1 rounded-md border border-red-500/20 bg-transparent text-red-600 cursor-pointer hover:bg-red-50 transition-colors shrink-0 font-bold"
        >
          ↩ revert
        </button>
      )}
    </div>
  )
}
