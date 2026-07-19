import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { tokens } from '../../tokens.js'

export interface BigButtonProps {
  label?: string
  status: 'idle' | 'running' | 'complete' | 'error'
  completionText?: string
  onRun: () => void
  onStepByStep: () => void
  onOpsHistory: () => void
  onSettings: () => void
}

function PlayIcon(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="white" aria-hidden="true">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  )
}

function ChevronIcon(): JSX.Element {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function CheckIcon(): JSX.Element {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function SpinnerIcon(): JSX.Element {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 2v4M12 18v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M2 12h4M18 12h4" />
    </svg>
  )
}

export function BigButton({
  label = 'Branch -> PR',
  status,
  completionText,
  onRun,
  onStepByStep,
  onOpsHistory,
  onSettings,
}: BigButtonProps): JSX.Element {
  const [dropOpen, setDropOpen] = useState(false)
  const [mainPressed, setMainPressed] = useState(false)
  const [menuPressed, setMenuPressed] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(event.target as Node)) {
        setDropOpen(false)
      }
    }

    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const isRunning = status === 'running'
  const isComplete = status === 'complete'
  const isError = status === 'error'
  const mainBg = isError ? '#7f1d1d' : tokens.color.accent.primary
  const mainHoverBg = isError ? '#991b1b' : tokens.color.accent.hover
  const menuHoverBg = isError ? '#7f1d1d' : tokens.color.accent.active

  const handleMouseDown = (setter: (value: boolean) => void) => () => setter(true)
  const handleMouseUp = (setter: (value: boolean) => void) => () => setter(false)

  const handleHover =
    (background: string) =>
    (event: ReactMouseEvent<HTMLButtonElement>): void => {
      event.currentTarget.style.background = background
    }

  const handleLeave =
    (background: string, setter: (value: boolean) => void) =>
    (event: ReactMouseEvent<HTMLButtonElement>): void => {
      event.currentTarget.style.background = background
      setter(false)
    }

  return (
    <div style={{ position: 'relative', width: '100%' }} ref={dropRef}>
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          borderRadius: tokens.radius.button,
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.12)',
          height: tokens.size.bigButton,
        }}
      >
        <button
          onClick={onRun}
          disabled={isRunning}
          aria-label={isRunning ? 'Workflow running' : isError ? 'Retry workflow' : 'Run workflow'}
          onMouseDown={handleMouseDown(setMainPressed)}
          onMouseUp={handleMouseUp(setMainPressed)}
          onMouseLeave={handleLeave(mainBg, setMainPressed)}
          onMouseEnter={handleHover(mainHoverBg)}
          style={{
            flex: 1,
            padding: '0 14px',
            background: mainBg,
            color: tokens.color.text.onAccent,
            fontSize: '13px',
            fontWeight: 500,
            border: 'none',
            cursor: isRunning ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '7px',
            transition: 'background 150ms, transform 100ms',
            whiteSpace: 'nowrap',
            opacity: isRunning ? 0.8 : 1,
            transform: mainPressed ? 'scale(0.98)' : 'scale(1)',
            transformOrigin: 'center',
          }}
        >
          {isRunning ? <SpinnerIcon /> : isComplete ? <CheckIcon /> : <PlayIcon />}
          <span>
            {isRunning
              ? 'Running...'
              : isComplete
                ? completionText ?? 'Done'
                : isError
                  ? 'Retry'
                  : label}
          </span>
        </button>

        <div
          style={{
            width: '1px',
            background: 'rgba(255,255,255,0.2)',
            alignSelf: 'stretch',
          }}
        />

        <button
          onClick={() => setDropOpen((value) => !value)}
          aria-label="More options"
          aria-expanded={dropOpen}
          onMouseDown={handleMouseDown(setMenuPressed)}
          onMouseUp={handleMouseUp(setMenuPressed)}
          onMouseLeave={handleLeave(mainBg, setMenuPressed)}
          onMouseEnter={handleHover(menuHoverBg)}
          style={{
            width: '40px',
            background: mainBg,
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 150ms, transform 100ms',
            transform: menuPressed ? 'scale(0.98)' : 'scale(1)',
            transformOrigin: 'center',
          }}
        >
          <ChevronIcon />
        </button>
      </div>

      {dropOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            left: 0,
            zIndex: 99,
            background: tokens.color.bg.surface,
            border: '1px solid #444',
            borderRadius: '6px',
            padding: '4px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}
        >
          {[
            { label: 'Step by step', action: onStepByStep },
            { label: 'Ops history', action: onOpsHistory },
            { label: 'Settings', action: onSettings },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => {
                item.action()
                setDropOpen(false)
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.background = tokens.color.bg.elevated
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.background = 'transparent'
              }}
              style={{
                width: '100%',
                padding: '7px 10px',
                background: 'transparent',
                border: 'none',
                borderRadius: '4px',
                color: tokens.color.text.primary,
                fontSize: '12px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 120ms',
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
