import { afterEach, describe, expect, it, vi } from 'vitest'

import { createPluginContext } from '@/contrib/plugin'

import { distributionAtCompletions } from './mentions'

// What the backend's `complete.path` answers for a bare `@` (tui_gateway/methods_complete.py):
// directives, then each profile by folder id, then the primary's upstream alias.
const GATEWAY = [
  { meta: 'git diff', text: '@diff' },
  { meta: 'attach file', text: '@file:' },
  { meta: 'agent profile', text: '@default' },
  { meta: 'agent profile', text: '@researcher' },
  { meta: 'agent profile (primary)', text: '@hermes' }
]

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('upstream Hermes (no distribution)', () => {
  it('names the primary bot @hermes and keeps the gateway rows as listed', () => {
    expect(createPluginContext('hermes-bots').defaultBotHandle).toBe('hermes')
    expect(distributionAtCompletions(GATEWAY)).toBe(GATEWAY)
  })
})

describe('ReAgent', () => {
  const reagent = () => vi.stubEnv('HERMES_DISTRIBUTION', 'reagent')

  it('names the primary bot @requrv', () => {
    reagent()

    expect(createPluginContext('hermes-bots').defaultBotHandle).toBe('requrv')
  })

  it("offers the gateway's primary rows (@default, @hermes) once, as @requrv", () => {
    reagent()

    expect(distributionAtCompletions(GATEWAY)).toEqual([
      { meta: 'git diff', text: '@diff' },
      { meta: 'attach file', text: '@file:' },
      { display: '@requrv', meta: 'agent profile', text: '@requrv' },
      { meta: 'agent profile', text: '@researcher' }
    ])
  })
})
