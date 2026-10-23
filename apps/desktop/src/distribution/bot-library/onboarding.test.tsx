import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { atom } from 'nanostores'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { LibraryEntry } from './api'
import { libraryEntry, mockApi } from './test-support'

const selectDesktopPaths = vi.fn()
const readDesktopDir = vi.fn()
const $desktopOnboarding = atom({ configured: true as boolean | null })
const $onboardingSurfaceClear = atom(true)

vi.mock('@/lib/desktop-fs', () => ({ readDesktopDir, selectDesktopPaths }))
vi.mock('@/store/notifications', () => ({ notifyError: vi.fn() }))
vi.mock('@/store/onboarding', () => ({ $desktopOnboarding }))
vi.mock('@/store/onboarding-presence', () => ({ $onboardingSurfaceClear }))
vi.mock('@/store/profile', () => ({ refreshProfiles: vi.fn(async () => []) }))

const SALES = '/Drive/Org/Reparti/Sales/Biblioteca agenti'

const ENTRIES: Record<string, LibraryEntry[]> = {
  [SALES]: [
    libraryEntry({ name: 'proposals', version: '1.2' }),
    libraryEntry({ name: 'quotes', version: '0.9' }),
    libraryEntry({ name: 'archive', status: 'installed' })
  ],
  'https://github.com/ReQurv/reagent-bots': [libraryEntry({ description: 'Writes things', name: 'writer' })]
}

const dir = (name: string) => ({ isDirectory: true, name, path: `/Drive/Org/Reparti/${name}` })

async function mount() {
  const { BotLibraryOnboarding } = await import('./onboarding')

  return render(<BotLibraryOnboarding />)
}

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('HERMES_DISTRIBUTION', 'reagent')
  $desktopOnboarding.set({ configured: true })
  $onboardingSurfaceClear.set(true)
  readDesktopDir.mockResolvedValue({ entries: [dir('Sales'), dir('HR')] })
})

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  window.localStorage.clear()
  selectDesktopPaths.mockReset()
  Reflect.deleteProperty(window, 'hermesDesktop')
})

describe('first-run department pick', () => {
  it('waits for provider setup, shows only without a department, and never exists in upstream Hermes', async () => {
    $desktopOnboarding.set({ configured: false })

    const { container } = await mount()

    expect(container.firstChild).toBeNull()

    cleanup()
    $desktopOnboarding.set({ configured: true })
    expect((await mount()).getByText('Find your bot library')).toBeTruthy()

    cleanup()
    vi.stubEnv('HERMES_DISTRIBUTION', '')
    expect((await mount()).container.firstChild).toBeNull()

    cleanup()
    vi.stubEnv('HERMES_DISTRIBUTION', 'reagent')

    const { $department } = await import('./store')

    $department.set('Sales')
    expect((await mount()).container.firstChild).toBeNull()
  })

  it('asks for the folder, then the department, then installs the ticked bots and records the department', async () => {
    selectDesktopPaths.mockResolvedValue(['/Drive/Org'])

    const api = mockApi(request =>
      request.path.startsWith('/api/bot-library?')
        ? { entries: ENTRIES[decodeURIComponent(request.path.split('source=')[1])] ?? [], source: '' }
        : { profile: (request.body as { name: string }).name, version: '1.0' }
    )

    await mount()
    fireEvent.click(screen.getByRole('button', { name: 'Choose folder…' }))

    fireEvent.click(await screen.findByRole('radio', { name: 'Sales' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    // Everything not yet installed is ticked; what is installed is not offered.
    const boxes = await screen.findAllByRole('checkbox')

    expect(boxes).toHaveLength(3)
    expect(boxes.every(box => box.getAttribute('data-state') === 'checked')).toBe(true)
    expect(screen.queryByText('archive')).toBeNull()

    fireEvent.click(boxes[1])
    fireEvent.click(screen.getByRole('button', { name: 'Install 2 bots' }))

    const { $botDepartment, $department } = await import('./store')

    await waitFor(() => expect($department.get()).toBe('Sales'))

    const installed = api.mock.calls
      .map(([request]) => request)
      .filter(request => request.path === '/api/bot-library/install')
      .map(request => request.body)

    expect(installed).toEqual([
      { name: 'proposals', source: '/Drive/Reparti/Sales/Biblioteca agenti/proposals' },
      { name: 'writer', source: '/Drive/Reparti/Sales/Biblioteca agenti/proposals' }
    ])
    // The department's bot is theirs; the standard bot is every department's.
    expect($botDepartment.get()).toEqual({ proposals: 'Sales' })
  })

  it('rejects a folder with no departments folder and keeps asking', async () => {
    selectDesktopPaths.mockResolvedValue(['/Drive/Wrong'])
    readDesktopDir.mockResolvedValue({ entries: [], error: 'ENOENT' })

    await mount()
    fireEvent.click(screen.getByRole('button', { name: 'Choose folder…' }))

    expect(await screen.findByText(/No "Reparti" folder/)).toBeTruthy()

    const { $libraryRoot } = await import('./store')

    expect($libraryRoot.get()).toBeNull()
  })

  it('lets a person with no library folder go on, and does not ask again', async () => {
    const { container } = await mount()

    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }))

    await waitFor(() => expect(container.firstChild).toBeNull())
  })
})
