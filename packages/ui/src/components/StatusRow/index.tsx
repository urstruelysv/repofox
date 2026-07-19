import { tokens } from '../../tokens.js'

export interface StatusRowProps {
  provider: string
  model: string
  branch: string
  isConnected: boolean
}

export function StatusRow({
  provider,
  model,
  branch,
  isConnected,
}: StatusRowProps): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
        marginTop: '8px',
        height: '28px',
      }}
    >
      <div
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: isConnected ? tokens.color.status.success : '#555555',
          flexShrink: 0,
        }}
      />

      <span
        style={{
          fontSize: '10px',
          color: tokens.color.text.secondary,
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {provider} · {model}
      </span>

      <span
        style={{
          fontSize: '10px',
          padding: '2px 7px',
          borderRadius: tokens.radius.pill,
          background: tokens.color.branch.pill,
          color: tokens.color.branch.pillText,
          fontWeight: 500,
          whiteSpace: 'nowrap',
          maxWidth: '100px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {branch}
      </span>
    </div>
  )
}
