import { renderHook } from '@testing-library/react'
import { atom } from 'nanostores'
import { describe, expect, it, vi } from 'vitest'

import type { ProfileInfo } from '@/types/hermes'

const $profiles = atom<ProfileInfo[]>([])

vi.mock('@/store/profile', () => ({ $profiles }))

const { isManagedConfigKey, libraryLockOf, useLibraryLocked } = await import('./locked')

const profile = (name: string, extra: Partial<ProfileInfo> = {}): ProfileInfo =>
  ({ has_env: false, is_default: false, model: null, name, path: `/p/${name}`, provider: null, skill_count: 0, ...extra })

describe('which bots the library locks', () => {
  it('locks exactly the profiles the backend flags, with the library version and managed keys', () => {
    expect(libraryLockOf(profile('mine'))).toBeNull()
    expect(libraryLockOf(profile('mine', { library_locked: false, library_managed_config: ['mcp_servers'] }))).toBeNull()
    expect(libraryLockOf(null)).toBeNull()

    expect(
      libraryLockOf(profile('sales', { distribution_version: '1.2', library_locked: true, library_managed_config: ['mcp_servers'] }))
    ).toEqual({ managedConfig: ['mcp_servers'], version: '1.2' })
  })

  it('tolerates an older backend that sends only the flag', () => {
    expect(libraryLockOf(profile('sales', { library_locked: true }))).toEqual({ managedConfig: [], version: null })
  })

  it('follows the profile list by name', () => {
    $profiles.set([profile('sales', { library_locked: true }), profile('mine')])

    expect(renderHook(() => useLibraryLocked('sales')).result.current).not.toBeNull()
    expect(renderHook(() => useLibraryLocked('mine')).result.current).toBeNull()
    expect(renderHook(() => useLibraryLocked('gone')).result.current).toBeNull()
    expect(renderHook(() => useLibraryLocked(undefined)).result.current).toBeNull()
  })
})

describe('which config keys the library manages', () => {
  const lock = { managedConfig: ['mcp_servers', 'agent.max_turns'] }

  it('matches a managed key, what is inside it and what contains it', () => {
    expect(isManagedConfigKey(lock, 'mcp_servers')).toBe(true)
    expect(isManagedConfigKey(lock, 'mcp_servers.crm')).toBe(true)
    expect(isManagedConfigKey(lock, 'agent.max_turns')).toBe(true)
    expect(isManagedConfigKey(lock, 'agent')).toBe(true)
  })

  it('leaves every other key to the person, and an unlocked bot manages none', () => {
    expect(isManagedConfigKey(lock, 'model')).toBe(false)
    expect(isManagedConfigKey(lock, 'mcp')).toBe(false)
    expect(isManagedConfigKey(null, 'mcp_servers')).toBe(false)
  })
})
