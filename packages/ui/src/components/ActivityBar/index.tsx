import { tokens } from '../../tokens.js'

export interface ActivityBarItem {
  id: string
  label: string
  active?: boolean
  hasBadge?: boolean
  onClick?: () => void
}

export interface ActivityBarProps {
  items: ActivityBarItem[]
}

export function ActivityBar({ items }: ActivityBarProps): JSX.Element {
  return (
    <div
      style={{
        width: tokens.size.activityBar,
        background: tokens.color.bg.surface,
        borderRight: `1px solid ${tokens.color.border.default}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: '8px',
        gap: '8px',
      }}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={item.onClick}
          title={item.label}
          style={{
            width: '100%',
            height: '40px',
            border: 'none',
            borderLeft: item.active ? '2px solid #ffffff' : '2px solid transparent',
            background: 'transparent',
            color: item.active ? '#ffffff' : '#cccccc',
            cursor: item.onClick ? 'pointer' : 'default',
            position: 'relative',
          }}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="7" />
            <path d="M12 8v8" />
            <path d="M8 12h8" />
          </svg>
          {item.hasBadge && (
            <span
              style={{
                position: 'absolute',
                top: '8px',
                right: '10px',
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: tokens.color.accent.primary,
              }}
            />
          )}
        </button>
      ))}
    </div>
  )
}
