import { act, cleanup, render, screen } from '@testing-library/react'
import type * as Nanostores from 'nanostores'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getProfileSoul } from '@/hermes'
import { refreshProfiles } from '@/store/profile'
import type { ProfileInfo } from '@/types/hermes'

import { ProfilesView } from './index'

// A library-installed bot's SOUL.md belongs to the library (it is rewritten on every update): the
// Manage Profiles page shows it read-only with the library notice, and an ordinary profile stays editable.

afterEach(cleanup)

vi.mock('@/components/chat/code-editor', () => ({
  CodeEditor: ({ disabled, initialValue }: { disabled?: boolean; initialValue: string }) => (
    <textarea aria-label="SOUL.md" defaultValue={initialValue} readOnly={disabled} />
  )
}))

vi.mock('@/hermes', () => ({
  createProfile: vi.fn(),
  deleteProfile: vi.fn(),
  getProfileSoul: vi.fn(async () => ({ content: 'Be the sales assistant.', exists: true })),
  renameProfile: vi.fn(),
  updateProfileSoul: vi.fn()
}))

vi.mock('@/store/notifications', () => ({ notify: vi.fn(), notifyError: vi.fn() }))
vi.mock('@/store/gateway', () => ({ retireLocalProfileGateways: vi.fn() }))

const { $profileColors, $showAllProfiles, activeGateway } = vi.hoisted(() => {
  const { atom } = require('nanostores') as typeof Nanostores

  return {
    $profileColors: atom<Record<string, string>>({}),
    $showAllProfiles: atom<boolean>(false),
    activeGateway: atom<string>('default')
  }
})

vi.mock('@/store/profile', () => ({
  $activeGatewayProfile: activeGateway,
  $profileColors,
  $profiles: { get: () => [] },
  $showAllProfiles,
  normalizeProfileKey: (name: null | string | undefined) => (name ?? '').trim() || 'default',
  profileLabel: (profile: { display_name?: string; name: string }) => (profile.display_name ?? '').trim() || profile.name,
  refreshProfiles: vi.fn(async () => [] as ProfileInfo[]),
  selectProfile: vi.fn(),
  setActiveProfile: vi.fn()
}))

const profile = (name: string, extra: Partial<ProfileInfo> = {}): ProfileInfo => ({
  has_env: false,
  is_default: false,
  model: null,
  name,
  path: `/home/user/.reagent/profiles/${name}`,
  provider: null,
  skill_count: 0,
  ...extra
})

async function show(selected: ProfileInfo) {
  vi.mocked(refreshProfiles).mockResolvedValue([profile('default'), selected])
  vi.mocked(getProfileSoul).mockClear()

  await act(async () => {
    render(<ProfilesView onClose={vi.fn()} />)
  })
  await act(async () => {
    screen.getAllByRole('button', { name: selected.name })[0].click()
  })

  return screen.findByLabelText<HTMLTextAreaElement>('SOUL.md')
}

describe('Manage Profiles and a library bot', () => {
  it('shows the SOUL read-only with the library notice and a duplicate', async () => {
    const soul = await show(profile('sales', { library_locked: true }))

    expect(soul.readOnly).toBe(true)
    expect(screen.getByText('Managed by your department library — duplicate to customise')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Duplicate as personal bot' })).toBeTruthy()
    expect((screen.getByRole('button', { name: /save/i }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('leaves an ordinary profile editable and without the notice', async () => {
    const soul = await show(profile('mine'))

    expect(soul.readOnly).toBe(false)
    expect(screen.queryByText('Managed by your department library — duplicate to customise')).toBeNull()
  })
})
