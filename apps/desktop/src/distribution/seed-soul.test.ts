import { atom } from 'nanostores'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProfileInfo, ProfileSoul } from '@/types/hermes'

import { UPSTREAM_DEFAULT_SOUL } from './seed-soul'

// Hoisted: the static seed-soul import above loads '@/hermes' before plain consts initialise.
const { getProfileSoul, refreshProfiles, renameProfile, updateProfileSoul } = vi.hoisted(() => ({
  getProfileSoul: vi.fn<(name: string) => Promise<ProfileSoul>>(),
  refreshProfiles: vi.fn(async () => []),
  renameProfile: vi.fn(async () => ({ name: 'default', ok: true, path: '/home' })),
  updateProfileSoul: vi.fn(async () => ({ ok: true }))
}))

vi.mock('@/hermes', () => ({ getProfileSoul, renameProfile, updateProfileSoul }))
// Only so the static import loads without the real store's side effects; each boot mocks its own.
vi.mock('@/store/profile', async () => ({ $profiles: (await import('nanostores')).atom([]), refreshProfiles }))

const defaultProfile = { display_name: 'ReQurv', is_default: true, name: 'default', path: '/home' } as ProfileInfo

const REQURV_IDENTITY = 'You are ReQurv, built by ReQurv.'
const UPSTREAM_IDENTITY = 'You are Hermes Agent, built by Nous Research.'

const LEGACY_PROTOCOL =
  '## Messaging other agents\n\nYou work alongside other named agents.\n\nTeammates when you were created:\n- (none yet)'

/** A fresh profile store per boot, so no earlier test's subscription sees this one's rows. */
async function boot(distribution: string) {
  const $profiles = atom<ProfileInfo[]>([])

  vi.stubEnv('HERMES_DISTRIBUTION', distribution)
  vi.resetModules()
  vi.doMock('@/store/profile', () => ({ $profiles, refreshProfiles }))
  await import('./seed')

  return $profiles
}

/** Lets a pending soul read and write settle, so a negative assertion means "never", not "not yet". */
const settle = () => new Promise(resolve => setTimeout(resolve, 0))

function soul(content: string, exists = true) {
  getProfileSoul.mockResolvedValue({ content, exists })
}

beforeEach(() => {
  getProfileSoul.mockReset()
  updateProfileSoul.mockClear()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('default bot persona seed', () => {
  it("renames upstream's untouched default persona to ReQurv, once, keeping the rest of it", async () => {
    soul(UPSTREAM_DEFAULT_SOUL)
    const $profiles = await boot('reagent')

    $profiles.set([defaultProfile])
    await vi.waitFor(() => expect(updateProfileSoul).toHaveBeenCalledTimes(1))
    $profiles.set([{ ...defaultProfile }])
    await settle()

    expect(getProfileSoul).toHaveBeenCalledTimes(1)
    expect(updateProfileSoul).toHaveBeenCalledWith(
      'default',
      REQURV_IDENTITY + UPSTREAM_DEFAULT_SOUL.slice(UPSTREAM_IDENTITY.length)
    )
  })

  it('still treats a default carrying the plugin-era messaging roster as untouched, and keeps the roster', async () => {
    soul(`${UPSTREAM_DEFAULT_SOUL}\n\n${LEGACY_PROTOCOL}\n`)
    const $profiles = await boot('reagent')

    $profiles.set([defaultProfile])
    await vi.waitFor(() => expect(updateProfileSoul).toHaveBeenCalledTimes(1))

    const [, written] = updateProfileSoul.mock.calls[0] as unknown as [string, string]

    expect(written.startsWith(REQURV_IDENTITY)).toBe(true)
    expect(written).not.toContain('Hermes Agent')
    expect(written.endsWith(`\n\n${LEGACY_PROTOCOL}\n`)).toBe(true)
  })

  it('never rewrites a persona the user edited, emptied, or that is already seeded', async () => {
    for (const [content, exists] of [
      [`${UPSTREAM_DEFAULT_SOUL} Answer in Italian.`, true],
      [UPSTREAM_DEFAULT_SOUL.replace('Be direct', 'Be warm'), true],
      ['You are Ada, a research assistant.', true],
      ['', true],
      ['', false],
      [REQURV_IDENTITY + UPSTREAM_DEFAULT_SOUL.slice(UPSTREAM_IDENTITY.length), true]
    ] as const) {
      soul(content, exists)
      const $profiles = await boot('reagent')

      $profiles.set([defaultProfile])
      await vi.waitFor(() => expect(getProfileSoul).toHaveBeenCalled())
      await settle()
      getProfileSoul.mockReset()
    }

    expect(updateProfileSoul).not.toHaveBeenCalled()
  })

  it('retries on the next profile refresh when the backend could not answer', async () => {
    getProfileSoul.mockRejectedValueOnce(new Error('backend restarting'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const $profiles = await boot('reagent')

    $profiles.set([defaultProfile])
    await vi.waitFor(() => expect(warn).toHaveBeenCalled())
    soul(UPSTREAM_DEFAULT_SOUL)
    $profiles.set([{ ...defaultProfile }])
    await vi.waitFor(() => expect(updateProfileSoul).toHaveBeenCalledTimes(1))
    warn.mockRestore()
  })

  it('leaves upstream Hermes alone', async () => {
    soul(UPSTREAM_DEFAULT_SOUL)
    const $profiles = await boot('')

    $profiles.set([defaultProfile])
    await settle()

    expect(getProfileSoul).not.toHaveBeenCalled()
    expect(updateProfileSoul).not.toHaveBeenCalled()
  })
})
