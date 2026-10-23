import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { LibraryEntry } from './api'
import type { LibrarySource } from './folders'
import { libraryEntry, mockApi } from './test-support'

const notifyError = vi.fn()
const refreshProfiles = vi.fn(async () => [])

vi.mock('@/store/notifications', () => ({ notifyError }))
vi.mock('@/store/profile', () => ({ refreshProfiles }))

const department: LibrarySource = { department: 'Sales', label: 'Sales', location: '/Drive/Reparti/Sales/Biblioteca agenti' }
const catalog: LibrarySource = { department: null, label: 'Standard bots', location: 'https://github.com/ReQurv/reagent-bots' }

const listing = (entries: LibraryEntry[]) => ({ entries, source: 'x' })

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  Reflect.deleteProperty(window, 'hermesDesktop')
  window.localStorage.clear()
  notifyError.mockReset()
})

describe('the library listings', () => {
  it('lists every source; one that fails shows its own error and leaves the others', async () => {
    mockApi(request => {
      if (request.path.includes('github.com')) {
        throw new Error('offline')
      }

      return listing([libraryEntry()])
    })

    const { $listings, loadLibrary } = await import('./library')

    await loadLibrary([department, catalog])

    expect($listings.get().map(item => item.state.status)).toEqual(['ready', 'error'])
  })

  it('installs a department bot, remembers its department and marks it installed', async () => {
    const api = mockApi(request =>
      request.path.startsWith('/api/bot-library?') ? listing([libraryEntry()]) : { profile: 'proposals', version: '1.0' }
    )

    const { $botDepartment } = await import('./store')
    const { $listings, installEntry, loadLibrary } = await import('./library')

    await loadLibrary([department])

    const entry = ($listings.get()[0].state as { entries: LibraryEntry[] }).entries[0]

    await expect(installEntry(department, entry)).resolves.toBe(true)

    expect(api).toHaveBeenLastCalledWith(
      expect.objectContaining({ body: { name: 'proposals', source: entry.source }, path: '/api/bot-library/install' })
    )
    expect($botDepartment.get()).toEqual({ proposals: 'Sales' })
    expect(($listings.get()[0].state as { entries: LibraryEntry[] }).entries[0]).toMatchObject({
      installed_profile: 'proposals',
      status: 'installed'
    })
    expect(refreshProfiles).toHaveBeenCalled()
  })

  it('does not tie a base-catalog bot to a department, so it survives every switch', async () => {
    mockApi(request =>
      request.path.startsWith('/api/bot-library?') ? listing([libraryEntry({ name: 'writer' })]) : { profile: 'writer', version: '1.0' }
    )

    const { $botDepartment } = await import('./store')
    const { $listings, installEntry, loadLibrary } = await import('./library')

    await loadLibrary([catalog])
    await installEntry(catalog, ($listings.get()[0].state as { entries: LibraryEntry[] }).entries[0])

    expect($botDepartment.get()).toEqual({})
  })

  it('updates an installed bot by its profile', async () => {
    const api = mockApi(request =>
      request.path.startsWith('/api/bot-library?')
        ? listing([libraryEntry({ installed_profile: 'proposals', installed_version: '1.0', status: 'update', version: '1.1' })])
        : { from_version: '1.0', profile: 'proposals', version: '1.1' }
    )

    const { $listings, loadLibrary, updateEntry } = await import('./library')

    await loadLibrary([department])
    await updateEntry(department, ($listings.get()[0].state as { entries: LibraryEntry[] }).entries[0])

    expect(api).toHaveBeenLastCalledWith(expect.objectContaining({ body: { profile: 'proposals' }, path: '/api/bot-library/update' }))
    expect(($listings.get()[0].state as { entries: LibraryEntry[] }).entries[0]).toMatchObject({
      installed_version: '1.1',
      status: 'installed'
    })
  })

  it('says so and records nothing when an install fails', async () => {
    mockApi(() => {
      throw new Error('missing distribution.yaml')
    })

    const { $botDepartment } = await import('./store')
    const { installEntry } = await import('./library')

    await expect(installEntry(department, libraryEntry())).resolves.toBe(false)

    expect(notifyError).toHaveBeenCalled()
    expect($botDepartment.get()).toEqual({})
  })
})
