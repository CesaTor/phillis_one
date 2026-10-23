import { atom } from 'nanostores'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProfileInfo } from '@/types/hermes'

import type { LibrarySyncResult } from './api'

const notify = vi.fn()
const refreshProfiles = vi.fn(async () => [])
const syncLibraryBots = vi.fn()
const $profiles = atom<ProfileInfo[]>([])

vi.mock('@/store/notifications', () => ({ notify }))
vi.mock('@/store/profile', () => ({
  $profiles,
  profileLabel: (profile: { display_name?: string; name: string }) => profile.display_name || profile.name,
  refreshProfiles
}))
vi.mock('@/store/windows', () => ({ isMainWindow: () => true }))
vi.mock('./api', () => ({ syncLibraryBots }))

const result = (overrides: Partial<LibrarySyncResult>): LibrarySyncResult => ({
  from_version: '1.0',
  profile: 'sales',
  status: 'updated',
  to_version: '1.3',
  ...overrides
})

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
  $profiles.set([{ display_name: 'Sales', name: 'sales' } as ProfileInfo])
})

afterEach(() => {
  vi.restoreAllMocks()
  notify.mockReset()
  syncLibraryBots.mockReset()
})

describe('the launch-time library sync', () => {
  it('toasts one updated bot by its name and version', async () => {
    const { runLibrarySync } = await import('./sync')

    syncLibraryBots.mockResolvedValue({ results: [result({})] })
    await runLibrarySync()

    expect(notify).toHaveBeenCalledWith({ kind: 'success', message: 'Sales bot updated to 1.3' })
    expect(refreshProfiles).toHaveBeenCalled()
  })

  it('folds several updates into one toast', async () => {
    const { runLibrarySync } = await import('./sync')

    syncLibraryBots.mockResolvedValue({
      results: [result({}), result({ profile: 'hr', to_version: '2.0' }), result({ profile: 'ops', status: 'unchanged' })]
    })
    await runLibrarySync()

    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith({ kind: 'success', message: 'Bots updated: Sales 1.3, hr 2.0' })
  })

  it('stays quiet for unchanged, unavailable and failed bots, logging the failures', async () => {
    const { runLibrarySync } = await import('./sync')

    syncLibraryBots.mockResolvedValue({
      results: [
        result({ status: 'unchanged' }),
        result({ profile: 'hr', status: 'source-unavailable' }),
        result({ error: 'bad yaml', profile: 'ops', status: 'error' })
      ]
    })
    await runLibrarySync()

    expect(notify).not.toHaveBeenCalled()
    expect(console.info).toHaveBeenCalledWith('[bot-library] sync', 'ops', 'error', 'bad yaml')
  })

  it('never raises when the backend cannot sync (an older runtime, a library offline)', async () => {
    const { runLibrarySync } = await import('./sync')

    syncLibraryBots.mockRejectedValue(new Error('404'))

    await expect(runLibrarySync()).resolves.toBeUndefined()
    expect(notify).not.toHaveBeenCalled()
  })

  it('syncs once per launch, when the profile list first arrives', async () => {
    vi.resetModules()
    $profiles.set([])
    syncLibraryBots.mockResolvedValue({ results: [] })

    const { startBotLibrarySync } = await import('./sync')

    startBotLibrarySync()
    expect(syncLibraryBots).not.toHaveBeenCalled()

    $profiles.set([{ name: 'default' } as ProfileInfo])
    $profiles.set([{ name: 'default' } as ProfileInfo, { name: 'sales' } as ProfileInfo])

    await vi.waitFor(() => expect(syncLibraryBots).toHaveBeenCalledTimes(1))
  })
})
