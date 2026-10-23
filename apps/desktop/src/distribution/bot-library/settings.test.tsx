import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { filterSettingsNav, settingsViewAllowed } from '..'

import { mockApi } from './test-support'

const readDesktopDir = vi.fn()
const selectDesktopPaths = vi.fn()

vi.mock('@/lib/desktop-fs', () => ({ readDesktopDir, selectDesktopPaths }))
vi.mock('@/store/notifications', () => ({ notifyError: vi.fn() }))
vi.mock('@/store/profile', () => ({ refreshProfiles: vi.fn(async () => []) }))

const dir = (name: string) => ({ isDirectory: true, name, path: `/Drive/Org/Reparti/${name}` })

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('HERMES_DISTRIBUTION', 'reagent')
  readDesktopDir.mockResolvedValue({ entries: [dir('Sales'), dir('HR')] })
  mockApi(() => ({ entries: [], source: '' }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  window.localStorage.clear()
  Reflect.deleteProperty(window, 'hermesDesktop')
})

describe('Settings ▸ Bot Library', () => {
  it('changes the department, which hides the previous department’s bots', async () => {
    const { $botDepartment, $department, $departmentHiddenBots, $libraryRoot } = await import('./store')

    $libraryRoot.set('/Drive/Org')
    $department.set('Sales')
    $botDepartment.set({ proposals: 'Sales' })

    const { BotLibrarySettings } = await import('./settings')

    render(<BotLibrarySettings />)

    expect($departmentHiddenBots.get().size).toBe(0)

    fireEvent.click(screen.getByRole('button', { name: 'Change department' }))
    fireEvent.click(await screen.findByRole('radio', { name: 'HR' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect($department.get()).toBe('HR'))
    expect([...$departmentHiddenBots.get()]).toEqual(['proposals'])
  })

  it('chooses the library folder with the native picker', async () => {
    selectDesktopPaths.mockResolvedValue(['/Drive/Org'])

    const { $libraryRoot } = await import('./store')
    const { BotLibrarySettings } = await import('./settings')

    render(<BotLibrarySettings />)
    fireEvent.click(screen.getByRole('button', { name: 'Choose folder…' }))

    await waitFor(() => expect($libraryRoot.get()).toBe('/Drive/Org'))
    expect(selectDesktopPaths).toHaveBeenCalledWith(expect.objectContaining({ directories: true }))
  })
})

describe('the Bot Library settings group', () => {
  it('is in the ReAgent nav, allowlisted, and nowhere in upstream Hermes', async () => {
    const { BOT_LIBRARY_VIEW, botLibraryNavGroups, botLibrarySettingsViews } = await import('./settings-nav')
    const open = vi.fn()

    const groups = botLibraryNavGroups('about', open)

    expect(botLibrarySettingsViews()).toEqual([BOT_LIBRARY_VIEW])
    expect(filterSettingsNav(groups).map(group => group.id)).toEqual([BOT_LIBRARY_VIEW])
    expect(settingsViewAllowed(BOT_LIBRARY_VIEW)).toBe(true)

    groups[0].onSelect()
    expect(open).toHaveBeenCalledWith(BOT_LIBRARY_VIEW)

    vi.stubEnv('HERMES_DISTRIBUTION', '')
    expect(botLibraryNavGroups('about', open)).toEqual([])
    expect(botLibrarySettingsViews()).toEqual([])
  })
})
