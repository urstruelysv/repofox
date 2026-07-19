import React from 'react'

interface CodeLine {
  c: string
  t: string
}

interface CodeWindowProps {
  lines: CodeLine[]
  title?: string
}

export function CodeWindow({ lines, title = 'terminal' }: CodeWindowProps) {
  return (
    <div className="bg-white border border-[#e5e5e5] rounded-lg overflow-hidden font-mono text-[13px] shadow-md">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#e5e5e5] bg-[#f9f9f9]">
        <div className="flex items-center gap-1.5">
          {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
            <div key={c} className="w-3 h-3 rounded-full" style={{ background: c }} />
          ))}
        </div>
        <span className="ml-1 text-[12px] text-[#999] font-medium">{title}</span>
      </div>

      {/* Terminal content */}
      <div className="p-4 leading-relaxed overflow-x-auto max-h-[400px] bg-white">
        {lines.map((line, i) => (
          <div
            key={i}
            style={{ color: line.c }}
            className="mb-1 whitespace-pre-wrap break-words"
          >
            {line.t || ' '}
          </div>
        ))}
      </div>
    </div>
  )
}
