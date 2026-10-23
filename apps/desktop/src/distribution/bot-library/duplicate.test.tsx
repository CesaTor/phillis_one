import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { atom } from 'nanostores'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProfileInfo } from '@/types/hermes'

import { mockApi } from './test-support'

const notify = vi.fn()
const notifyError = vi.fn()
const refreshProfiles = vi.fn(async () => [])
const $profiles = atom<ProfileInfo[]>([])

vi.mock('@/store/notifications', () => ({ notify, notifyError }))
vi.mock('@/store/profile', () => ({
  $profiles,
  profileLabel: (profile: { display_name?: string; name: string }) => profile.display_name || profile.name,
  refreshProfiles
}))

beforeEach(() => {
  $profiles.set([{ bot_title: 'Proposals', library_locked: true, name: 'proposals' } as ProfileInfo])
})

afterEach(async () => {
  cleanup()
  const { closeDuplicate } = await import('./duplicate')

  closeDuplicate()
  vi.clearAllMocks()
  Reflect.deleteProperty(window, 'hermesDesktop')
})

async function open(opened?: (copy: string) => void) {
  const { requestDuplicate } = await import('./duplicate')
  const { LibraryDuplicateDialog } = await import('./duplicate-dialog')

  render(<LibraryDuplicateDialog />)
  requestDuplicate('proposals', opened)

  return screen.findByLabelText('Name of the copy')
}

describe('Duplicate as personal bot', () => {
  it('asks for a name, defaulting to "<name> (copy)"', async () => {
    const input = await open()

    expect((input as HTMLInputElement).value).toBe('Proposals (copy)')
    expect(screen.getByText('Duplicate Proposals')).toBeTruthy()
  })

  it('duplicates under the typed name, refreshes the profiles and hands over the copy', async () => {
    const api = mockApi(() => ({ profile: 'proposals-mine' }))
    const opened = vi.fn()
    const input = await open(opened)

    fireEvent.change(input, { target: { value: '  My proposals ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }))

    await waitFor(() => expect(opened).toHaveBeenCalledWith('proposals-mine'))
    expect(api).toHaveBeenCalledWith(
      expect.objectContaining({ body: { name: 'My proposals', profile: 'proposals' }, method: 'POST', path: '/api/bot-library/duplicate' })
    )
    expect(refreshProfiles).toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith({ kind: 'success', message: 'My proposals created. It is yours to customise.' })
    expect(screen.queryByLabelText('Name of the copy')).toBeNull()
  })

  it('shows the backend’s refusal and stays open to try another name', async () => {
    mockApi(() => {
      throw new Error('{"detail":"A bot named Proposals (copy) already exists"}')
    })
    const opened = vi.fn()
    await open(opened)

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }))

    await waitFor(() => expect(notifyError).toHaveBeenCalledTimes(1))
    expect(notifyError.mock.calls[0][0]).toBeInstanceOf(Error)
    expect(notifyError.mock.calls[0][1]).toBe('Could not duplicate the bot')
    expect(opened).not.toHaveBeenCalled()
    expect(refreshProfiles).not.toHaveBeenCalled()
    expect(await screen.findByLabelText('Name of the copy')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Duplicate' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('does not call the backend without a name', async () => {
    const api = mockApi(() => ({ profile: 'x' }))
    const input = await open()

    fireEvent.change(input, { target: { value: '   ' } })

    expect((screen.getByRole('button', { name: 'Duplicate' }) as HTMLButtonElement).disabled).toBe(true)
    expect(api).not.toHaveBeenCalled()
  })
})

describe('the Manage Profiles page and a library bot', () => {
  it('shows the notice and the row-menu entry for a locked profile only', async () => {
    const { libraryMenuItems, LibraryLockNotice } = await import('./locked-notice')
    const locked = { library_locked: true, name: 'proposals' } as ProfileInfo
    const mine = { name: 'mine' } as ProfileInfo

    expect(libraryMenuItems(locked).map(item => item.label)).toEqual(['Duplicate as personal bot'])
    expect(libraryMenuItems(mine)).toEqual([])

    expect(render(<LibraryLockNotice profile={mine} />).container.firstChild).toBeNull()
    render(<LibraryLockNotice profile={locked} />)
    expect(screen.getByText('Managed by your department library — duplicate to customise')).toBeTruthy()
  })
})
