import { atom } from 'nanostores'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProfileInfo } from '@/types/hermes'

const renameProfile = vi.fn(async () => ({ name: 'default', ok: true, path: '/home' }))
const refreshProfiles = vi.fn(async () => [])
const getProfileSoul = vi.fn(async () => ({ content: '', exists: false }))
const updateProfileSoul = vi.fn(async () => ({ ok: true }))

vi.mock('@/hermes', () => ({ getProfileSoul, renameProfile, updateProfileSoul }))

const profile = (overrides: Partial<ProfileInfo>): ProfileInfo =>
  ({
    has_env: false,
    is_default: true,
    model: null,
    name: 'default',
    path: '/home',
    provider: null,
    skill_count: 0,
    ...overrides
  }) as ProfileInfo

/** A fresh profile store per boot, so no earlier test's subscription sees this one's rows. */
async function boot(distribution: string) {
  const $profiles = atom<ProfileInfo[]>([])

  vi.stubEnv('HERMES_DISTRIBUTION', distribution)
  vi.resetModules()
  vi.doMock('@/store/profile', () => ({ $profiles, refreshProfiles }))
  await import('./seed')

  return $profiles
}

beforeEach(() => {
  renameProfile.mockClear()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('default bot name seed', () => {
  it('names an unnamed default profile ReQurv in ReAgent', async () => {
    const $profiles = await boot('reagent')

    $profiles.set([profile({})])
    await vi.waitFor(() => expect(renameProfile).toHaveBeenCalledWith('default', 'ReQurv'))
  })

  it('never renames a default the user already named', async () => {
    const $profiles = await boot('reagent')

    $profiles.set([profile({ display_name: 'Ada' })])
    $profiles.set([profile({ bot_title: 'Research' })])
    expect(renameProfile).not.toHaveBeenCalled()
  })

  it('leaves upstream Hermes alone', async () => {
    const $profiles = await boot('')

    $profiles.set([profile({})])
    expect(renameProfile).not.toHaveBeenCalled()
  })
})
