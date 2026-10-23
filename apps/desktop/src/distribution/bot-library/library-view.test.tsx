import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { LibraryEntry } from './api'
import { libraryEntry, mockApi } from './test-support'

vi.mock('@/store/notifications', () => ({ notifyError: vi.fn() }))
vi.mock('@/store/profile', () => ({ refreshProfiles: vi.fn(async () => []) }))

const SALES = '/Drive/Org/Reparti/Sales/Biblioteca agenti'
const CATALOG = 'https://github.com/ReQurv/reagent-bots'

const ENTRIES: Record<string, LibraryEntry[]> = {
  [SALES]: [
    libraryEntry({
      description: 'Drafts proposals',
      env_requires: [
        { description: 'CRM access', name: 'CRM_TOKEN', required: true },
        { description: 'Slack', name: 'SLACK_TOKEN', required: false }
      ],
      has_cron: true,
      name: 'proposals',
      skills: ['crm-lookup', 'pdf-export']
    }),
    libraryEntry({
      installed_profile: 'quotes',
      installed_version: '1.0',
      name: 'quotes',
      status: 'update',
      version: '1.1'
    })
  ],
  [CATALOG]: [libraryEntry({ installed_profile: 'writer', installed_version: '2.0', name: 'writer', status: 'installed', version: '2.0' })]
}

async function renderView() {
  const { $department, $libraryRoot } = await import('./store')

  $libraryRoot.set('/Drive/Org')
  $department.set('Sales')

  const { BotLibraryView } = await import('./library-view')

  render(<BotLibraryView />)
}

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('HERMES_DISTRIBUTION', 'reagent')
})

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  window.localStorage.clear()
  Reflect.deleteProperty(window, 'hermesDesktop')
})

describe('the Bot Library view', () => {
  it('lists the department and the base catalog with a status chip per bot', async () => {
    mockApi(request => ({
      entries: ENTRIES[decodeURIComponent(request.path.split('source=')[1])] ?? [],
      source: ''
    }))
    await renderView()

    expect(await screen.findByText('proposals')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Sales' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Standard bots' })).toBeTruthy()
    expect(screen.getByText('New')).toBeTruthy()
    expect(screen.getByText('Update available')).toBeTruthy()
    expect(screen.getByText('Installed')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Install' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Update' })).toHaveLength(1)
  })

  it('shows skills, scheduled jobs and the credentials an entry needs before it is installed', async () => {
    mockApi(request => ({
      entries: ENTRIES[decodeURIComponent(request.path.split('source=')[1])] ?? [],
      source: ''
    }))
    await renderView()

    const row = (await screen.findByText('proposals')).closest('li') as HTMLElement

    expect(within(row).getByText('crm-lookup, pdf-export')).toBeTruthy()
    expect(within(row).getByText('Yes')).toBeTruthy()
    expect(within(row).getByText('CRM_TOKEN (required), SLACK_TOKEN (optional)')).toBeTruthy()
  })

  it('installs an entry and flips it to installed', async () => {
    const api = mockApi(request =>
      request.path.startsWith('/api/bot-library?')
        ? { entries: ENTRIES[decodeURIComponent(request.path.split('source=')[1])] ?? [], source: '' }
        : { profile: 'proposals', version: '1.0' }
    )

    await renderView()
    fireEvent.click(await screen.findByRole('button', { name: 'Install' }))

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Install' })).toBeNull())
    expect(api).toHaveBeenCalledWith(
      expect.objectContaining({ body: { name: 'proposals', source: '/Drive/Reparti/Sales/Biblioteca agenti/proposals' }, path: '/api/bot-library/install' })
    )
    expect(screen.getAllByText('Installed')).toHaveLength(2)
  })

  it('says plainly when the standard catalog is unreachable, without hiding the others', async () => {
    mockApi(request => {
      if (request.path.includes('github.com')) {
        throw new Error('offline')
      }

      return { entries: ENTRIES[SALES], source: '' }
    })
    await renderView()

    expect(await screen.findByText("The standard bots catalog isn\u2019t reachable right now.")).toBeTruthy()
    expect(screen.getByText('proposals')).toBeTruthy()
  })

  it('shows the backend sentence, not the bridge wrapper, when the department folder cannot be read', async () => {
    mockApi(request => {
      if (request.path.includes('github.com')) {
        return { entries: [], source: '' }
      }

      throw new Error('Error invoking remote method \'hermes:api\': Error: 400: {"detail":"That folder has no bots."}')
    })
    await renderView()

    expect(await screen.findByText('Could not read Sales: That folder has no bots.')).toBeTruthy()
    expect(screen.queryByText(/Error invoking/)).toBeNull()
  })
})
