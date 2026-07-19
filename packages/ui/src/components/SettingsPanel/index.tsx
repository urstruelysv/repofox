// =============================================================================
// F8 — Settings UI (presentation only, zero secret handling)
// =============================================================================
// First principles:
//   1. This component lives in @repofox/ui — a shared package consumed by
//      the VS Code webview now and (per roadmap) Cursor/Vim later. It
//      therefore CANNOT know about vscode.SecretStorage, postMessage, or
//      any host capability. It speaks only in props/callbacks.
//   2. The host owns secrets and network. The UI owns layout and intent.
//      The contract between them is the props interface: `onSave`, `onTest`,
//      (and for F8, a new `onTestGitHub`). Whoever mounts this component
//      provides those callbacks; the component just calls them and renders
//      the result. This is what keeps it portable across editor hosts.
//   3. Test feedback must be MORE specific than ok/fail. "connected" is a
//      lie if all we did was check `apiKey.length > 10` (which is what
//      App.tsx currently does — see line ~193). The honest UI shows what
//      was actually verified: provider model name on success, the auth
//      error on failure, a scope warning on partial-success for GH.
//
// What this file is:
//   The sole settings surface. It already has:
//     - provider radio (line ~88)
//     - masked AI key input (line ~148)
//     - Test Connection button wired to onTest (line ~156)
//     - GH token input (line ~174)  ← but NO test button yet
//     - Save button (line ~199)
//
// What F8 must add here:
//   1. A second test button next to the GH token input, mirroring the AI
//      one but calling a new `onTestGitHub` prop. Result UI must show
//      login on success, scope warning when `repo` is missing.
//   2. Auto-trim onPaste for both inputs. Pasting from a browser frequently
//      includes a trailing newline or space; that's the #1 cause of
//      "valid key reports invalid". One handler per input:
//          onPaste={(e) => { e.preventDefault();
//            setX(e.clipboardData.getData('text').trim()) }}
//   3. Extend the test result type. `'ok' | 'fail' | null` is too thin for
//      GH (need a 'partial' state for missing-scope) and too thin for AI
//      (need to show the model name). Suggested:
//          type AITestResult = { state: 'ok'; model: string }
//                            | { state: 'fail'; reason: 'auth' | 'transient' | 'unknown' }
//                            | { state: 'idle' | 'testing' }
//          type GHTestResult = { state: 'ok'; login: string; missingRepo: boolean }
//                            | { state: 'fail'; reason: 'auth' | 'transient' | 'unknown' }
//                            | { state: 'idle' | 'testing' }
//
// Why both onTest callbacks return Promises:
//   The probe is async and the button must show "testing..." while it runs.
//   Returning a Promise lets this component own the spinner state without
//   knowing what the host is doing under the hood (postMessage round-trip
//   in VS Code, fetch() in a future web target, etc.).
// =============================================================================

import { useMemo, useState, type ReactNode } from 'react'
import type { AIProvider } from '@repofox/core'
import { tokens } from '../../tokens.js'

// F8 — test result types. Discriminated unions instead of ok/fail booleans
// because UI copy depends on WHY a test failed (auth vs network vs rate
// limit) and on partial-success states (GH token valid but missing repo
// scope). Booleans rotted as soon as we needed model names + scope warnings.

export type AITestState =
  | { state: 'idle' }
  | { state: 'testing' }
  | { state: 'ok'; models: string[] }
  | { state: 'fail'; reason: 'auth' | 'network' | 'rate_limit' | 'unknown'; message: string }

export type GHTestState =
  | { state: 'idle' }
  | { state: 'testing' }
  | {
      state: 'ok'
      username: string
      hasRepoScope: boolean
      isFineGrained: boolean
    }
  | { state: 'fail'; reason: 'auth' | 'network' | 'rate_limit' | 'unknown'; message: string }

export interface SettingsPanelProps {
  currentProvider: AIProvider
  currentApiKey: string
  githubToken: string
  hasSavedApiKey?: boolean
  hasSavedGitHubToken?: boolean
  onSave: (settings: SettingsValues) => void
  onTest: (
    provider: AIProvider,
    apiKey: string,
  ) => Promise<Exclude<AITestState, { state: 'idle' | 'testing' }>>
  onTestGitHub: (
    token: string,
  ) => Promise<Exclude<GHTestState, { state: 'idle' | 'testing' }>>
  onOpenExternal?: (url: string) => void
}

export interface SettingsValues {
  provider: AIProvider
  apiKey: string
  githubToken: string
}

const providers: { value: AIProvider; label: string; placeholder: string; link: string }[] = [
  {
    value: 'groq',
    label: 'Groq (free tier)',
    placeholder: 'gsk_...',
    link: 'https://console.groq.com/keys',
  },
  {
    value: 'openai',
    label: 'OpenAI',
    placeholder: 'sk-...',
    link: 'https://platform.openai.com/api-keys',
  },
  {
    value: 'anthropic',
    label: 'Anthropic',
    placeholder: 'sk-ant-...',
    link: 'https://console.anthropic.com/',
  },
]

export function SettingsPanel({
  currentProvider,
  currentApiKey,
  githubToken,
  hasSavedApiKey = false,
  hasSavedGitHubToken = false,
  onSave,
  onTest,
  onTestGitHub,
  onOpenExternal,
}: SettingsPanelProps): JSX.Element {
  const [provider, setProvider] = useState<AIProvider>(currentProvider)
  const [apiKey, setApiKey] = useState(currentApiKey)
  const [ghToken, setGhToken] = useState(githubToken)
  const [aiTest, setAiTest] = useState<AITestState>({ state: 'idle' })
  const [ghTest, setGhTest] = useState<GHTestState>({ state: 'idle' })
  const [saved, setSaved] = useState(false)

  const selectedProvider = useMemo(
    () => providers.find((item) => item.value === provider) ?? providers[0]!,
    [provider],
  )

  const openExternal = (url: string): void => {
    if (onOpenExternal) {
      onOpenExternal(url)
      return
    }

    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handleTest = async (): Promise<void> => {
    if (!apiKey.trim()) return
    setAiTest({ state: 'testing' })
    const result = await onTest(provider, apiKey)
    setAiTest(result)
  }

  const handleTestGh = async (): Promise<void> => {
    if (!ghToken.trim()) return
    setGhTest({ state: 'testing' })
    const result = await onTestGitHub(ghToken)
    setGhTest(result)
  }

  // F8 — auto-trim on paste. Browser paste from a credentials manager often
  // includes a trailing newline or spaces; that's the #1 cause of "valid key
  // reports invalid." Strip at intake.
  const trimmedPaste =
    (set: (v: string) => void) =>
    (e: React.ClipboardEvent<HTMLInputElement>): void => {
      e.preventDefault()
      set(e.clipboardData.getData('text').trim())
    }

  const handleSave = (): void => {
    onSave({ provider, apiKey, githubToken: ghToken })
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <SectionLabel>AI Provider</SectionLabel>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {providers.map((item) => (
          <label
            key={item.value}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '7px 9px',
              borderRadius: tokens.radius.card,
              border: `1px solid ${provider === item.value ? tokens.color.accent.primary : tokens.color.border.default}`,
              background: provider === item.value ? '#102f2c' : 'transparent',
              cursor: 'pointer',
              transition: 'all 120ms',
            }}
          >
            <input
              type="radio"
              name="provider"
              value={item.value}
              checked={provider === item.value}
              onChange={() => setProvider(item.value)}
              style={{ accentColor: tokens.color.accent.primary }}
            />
            <span style={{ fontSize: '12px', color: tokens.color.text.primary, flex: 1 }}>
              {item.label}
            </span>
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault()
                openExternal(item.link)
              }}
              style={{
                fontSize: '10px',
                color: tokens.color.branch.pillText,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              get key -&gt;
            </button>
          </label>
        ))}
      </div>

      <div>
        <label
          style={{
            fontSize: '10px',
            color: tokens.color.text.muted,
            display: 'block',
            marginBottom: '5px',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          API Key
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          onPaste={trimmedPaste(setApiKey)}
          placeholder={selectedProvider.placeholder}
          style={inputStyle}
        />
        {hasSavedApiKey ? <SavedCredentialHint /> : null}
        <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
          <SmallButton
            onClick={handleTest}
            disabled={!apiKey || aiTest.state === 'testing'}
          >
            {aiTestLabel(aiTest)}
          </SmallButton>
        </div>
        {aiTest.state === 'ok' && aiTest.models.length > 0 ? (
          <div
            style={{
              fontSize: '10px',
              color: tokens.color.text.muted,
              marginTop: '4px',
            }}
          >
            {aiTest.models.length} models available
          </div>
        ) : null}
        {aiTest.state === 'fail' ? (
          <div
            style={{
              fontSize: '10px',
              color: tokens.color.status.success ? '#ff6b6b' : '#ff6b6b',
              marginTop: '4px',
            }}
          >
            {aiFailCopy(aiTest.reason)}
          </div>
        ) : null}
      </div>

      <div>
        <SectionLabel>GitHub Token</SectionLabel>
        <div style={{ fontSize: '11px', color: tokens.color.text.muted, marginBottom: '5px' }}>
          Required for PR creation. Scope:{' '}
          <code style={{ color: tokens.color.branch.pillText }}>repo</code>
        </div>
        <input
          type="password"
          value={ghToken}
          onChange={(event) => setGhToken(event.target.value)}
          onPaste={trimmedPaste(setGhToken)}
          placeholder="ghp_..."
          style={inputStyle}
        />
        {hasSavedGitHubToken ? <SavedCredentialHint /> : null}
        <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
          <SmallButton
            onClick={handleTestGh}
            disabled={!ghToken || ghTest.state === 'testing'}
          >
            {ghTestLabel(ghTest)}
          </SmallButton>
        </div>
        {ghTest.state === 'ok' ? (
          <div
            style={{
              fontSize: '10px',
              color: ghTest.hasRepoScope || ghTest.isFineGrained ? tokens.color.text.muted : '#f5a623',
              marginTop: '4px',
            }}
          >
            {ghOkCopy(ghTest)}
          </div>
        ) : null}
        {ghTest.state === 'fail' ? (
          <div style={{ fontSize: '10px', color: '#ff6b6b', marginTop: '4px' }}>
            {ghFailCopy(ghTest.reason)}
          </div>
        ) : null}
        <div style={{ marginTop: '4px' }}>
          <button
            type="button"
            onClick={() => openExternal('https://github.com/settings/tokens/new?scopes=repo')}
            style={{
              fontSize: '10px',
              color: tokens.color.branch.pillText,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            Generate token on GitHub -&gt;
          </button>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={!apiKey}
        style={{
          padding: '9px 0',
          background: saved ? tokens.color.status.successBg : tokens.color.accent.primary,
          color: tokens.color.text.onAccent,
          border: `1px solid ${saved ? tokens.color.status.success : tokens.color.accent.primary}`,
          borderRadius: tokens.radius.button,
          fontSize: '13px',
          fontWeight: 500,
          cursor: !apiKey ? 'not-allowed' : 'pointer',
          transition: 'all 150ms',
          opacity: !apiKey ? 0.5 : 1,
        }}
      >
        {saved ? 'Saved' : 'Save settings'}
      </button>
    </div>
  )
}

function SavedCredentialHint(): JSX.Element {
  return (
    <div style={{ fontSize: '10px', color: tokens.color.status.success, marginTop: '5px' }}>
      Saved securely ✓ Leave blank to keep it.
    </div>
  )
}

function aiTestLabel(s: AITestState): string {
  switch (s.state) {
    case 'idle':
      return 'test connection'
    case 'testing':
      return 'testing...'
    case 'ok':
      return 'connected'
    case 'fail':
      return 'failed'
  }
}

function aiFailCopy(reason: 'auth' | 'network' | 'rate_limit' | 'unknown'): string {
  switch (reason) {
    case 'auth':
      return 'invalid key — check the value or generate a new one'
    case 'network':
      return 'network unreachable — retry'
    case 'rate_limit':
      return 'rate-limited — wait a moment and retry'
    case 'unknown':
      return 'unexpected error — see output panel'
  }
}

function ghTestLabel(s: GHTestState): string {
  switch (s.state) {
    case 'idle':
      return 'test token'
    case 'testing':
      return 'testing...'
    case 'ok':
      return s.hasRepoScope || s.isFineGrained ? 'verified' : 'verified (warn)'
    case 'fail':
      return 'failed'
  }
}

function ghOkCopy(
  s: Extract<GHTestState, { state: 'ok' }>,
): string {
  if (s.isFineGrained) return `signed in as ${s.username} — fine-grained PAT, scopes not inspectable`
  if (!s.hasRepoScope) return `signed in as ${s.username} — missing 'repo' scope, PR creation will fail`
  return `signed in as ${s.username} — repo scope present`
}

function ghFailCopy(reason: 'auth' | 'network' | 'rate_limit' | 'unknown'): string {
  switch (reason) {
    case 'auth':
      return 'invalid token — check the value or generate a new one'
    case 'network':
      return 'network unreachable — retry'
    case 'rate_limit':
      return 'rate-limited — wait a moment and retry'
    case 'unknown':
      return 'unexpected error — see output panel'
  }
}

function SectionLabel({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div
      style={{
        fontSize: '10px',
        fontWeight: 600,
        color: tokens.color.text.muted,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </div>
  )
}

function SmallButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode
  onClick: () => void | Promise<void>
  disabled?: boolean
}): JSX.Element {
  return (
    <button
      onClick={() => void onClick()}
      disabled={disabled}
      style={{
        fontSize: '10px',
        padding: '3px 9px',
        borderRadius: '4px',
        border: `1px solid ${tokens.color.border.default}`,
        background: 'transparent',
        color: tokens.color.text.secondary,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  background: tokens.color.bg.elevated,
  border: `1px solid ${tokens.color.border.default}`,
  borderRadius: tokens.radius.card,
  color: tokens.color.text.primary,
  fontSize: '12px',
  boxSizing: 'border-box',
  outline: 'none',
}
