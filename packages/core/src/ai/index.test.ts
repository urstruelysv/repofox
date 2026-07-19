// Sanitizer regression tests. The sanitizer is the cheap "rescue 90% of LLM
// outputs" pass that runs before validateRefFormat. Each case below is a real
// pattern observed in AI output during dogfooding: the spec is *output*
// shape, not internals — if a refactor changes the rules used inside but
// keeps these inputs producing these outputs, that's still correct behavior.

import { describe, expect, it } from 'vitest'
import { sanitizeBranchName } from './index.js'

describe('sanitizeBranchName', () => {
  it('rewrites commit-style "feat: foo" prefix into branch-style "feat/foo"', () => {
    expect(sanitizeBranchName('feat: add login')).toBe('feat/add-login')
  })

  it('collapses whitespace runs into single hyphens', () => {
    expect(sanitizeBranchName('feat/add   new   page')).toBe('feat/add-new-page')
  })

  it('strips git-forbidden characters', () => {
    expect(sanitizeBranchName('feat/foo:bar~baz^qux?quux*[a]\\b')).toBe('feat/foobarbazquxquuxab')
  })

  it('collapses double-dot sequences (forbidden by git)', () => {
    expect(sanitizeBranchName('feat/foo..bar')).toBe('feat/foo-bar')
  })

  it('collapses double slashes', () => {
    expect(sanitizeBranchName('feat//foo')).toBe('feat/foo')
  })

  it('strips trailing .lock', () => {
    expect(sanitizeBranchName('feat/foo.lock')).toBe('feat/foo')
  })

  it('strips leading and trailing dots, slashes, hyphens', () => {
    expect(sanitizeBranchName('-/.feat/foo./-')).toBe('feat/foo')
  })

  it('removes ASCII control characters', () => {
    expect(sanitizeBranchName('feat/foobar')).toBe('feat/foobar')
  })

  it('drops the @{ sequence', () => {
    expect(sanitizeBranchName('feat/foo@{bar')).toBe('feat/foobar')
  })

  it('caps very long names at 200 characters', () => {
    const long = 'feat/' + 'a'.repeat(500)
    expect(sanitizeBranchName(long).length).toBeLessThanOrEqual(200)
  })
})
