import { atom } from 'nanostores'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { holdAllProfiles } from './profile-scope'

describe('holdAllProfiles', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('ReAgent: every attempt to leave the all-profiles view is put straight back', () => {
    vi.stubEnv('HERMES_DISTRIBUTION', 'reagent')

    const showAll = atom(false)

    holdAllProfiles(showAll)
    expect(showAll.get()).toBe(true)

    showAll.set(false)
    expect(showAll.get()).toBe(true)
  })

  it('upstream: the atom is left alone', () => {
    const showAll = atom(false)

    holdAllProfiles(showAll)
    showAll.set(false)

    expect(showAll.get()).toBe(false)
  })
})
