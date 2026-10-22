import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AboutSettings } from '@/app/settings/about-settings'

import { LicensesSection } from './licenses'
import * as actualData from './licenses-data'
import type * as LicensesData from './licenses-data'
import { readPackages, type ThirdPartyPackage } from './licenses-data'

import { licensesScreenAllowed } from '.'

vi.mock('./licenses-data', async importOriginal => ({
  ...(await importOriginal<typeof LicensesData>()),
  readPackages: vi.fn()
}))

vi.mock('@/store/updates', async (): Promise<Record<string, unknown>> => {
  const { atom } = await import('nanostores')

  return {
    $desktopVersion: atom(null),
    $updateStatus: atom(null),
    checkBackendUpdates: vi.fn(),
    refreshDesktopVersion: vi.fn().mockResolvedValue(null),
    sourceUpdateTrack: () => null
  }
})

vi.mock('@/components/update-status', () => ({ UpdateStatusCard: () => null, VersionHero: () => null }))
vi.mock('@/components/version-details', () => ({ VersionDetails: () => null }))
vi.mock('./../app/settings/update-channel-row', () => ({ UpdateChannelRow: () => null }))
vi.mock('./../app/settings/uninstall-section', () => ({ UninstallSection: () => null }))

const PACKAGES = [
  { name: 'react', version: '19.0.0', license: 'MIT' },
  { name: 'lodash', version: '4.17.21', license: 'MIT' },
  { name: 'requests', version: '2.32.0', license: 'Apache-2.0' }
]

// The bundled third-party.json is absent in the tree until the build generates it, so the list
// comes through a stand-in for the loader; the notice texts are the real bundled files.
function listIs(packages: ThirdPartyPackage[]) {
  vi.mocked(readPackages).mockResolvedValue(packages)
}

function openLicenses() {
  render(<LicensesSection />)
  fireEvent.click(screen.getByRole('button', { name: 'View licenses' }))

  return screen.getByRole('dialog')
}

beforeEach(() => {
  listIs([])
  vi.stubEnv('HERMES_DISTRIBUTION', 'reagent')
})

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

describe('the Licenses entry', () => {
  it('exists in ReAgent only, on the About page', () => {
    expect(licensesScreenAllowed()).toBe(true)
    render(<AboutSettings />)
    expect(screen.getByRole('button', { name: 'View licenses' })).toBeTruthy()

    cleanup()
    vi.stubEnv('HERMES_DISTRIBUTION', '')
    expect(licensesScreenAllowed()).toBe(false)
    render(<AboutSettings />)
    expect(screen.queryByRole('button', { name: 'View licenses' })).toBeNull()
  })
})

describe('the Licenses view', () => {
  it('opens on the attribution paragraph and one collapsed section per bundled text', () => {
    const dialog = openLicenses()

    expect(
      within(dialog).getByText(
        "ReAgent is built on Hermes Agent by Nous Research (MIT License). ReQurv's own parts are © 2026 ReQurv, All Rights Reserved."
      )
    ).toBeTruthy()

    for (const title of [
      'Hermes Agent: MIT License (Nous Research)',
      'security-guidance: Apache License 2.0',
      'security-guidance: NOTICE',
      'Syne font: SIL Open Font License 1.1'
    ]) {
      expect(within(dialog).getByRole('button', { name: title }).getAttribute('aria-expanded')).toBe('false')
    }

    expect(within(dialog).queryByText(/Copyright \(c\) 2025 Nous Research/)).toBeNull()
  })

  it.each([
    ['Hermes Agent: MIT License (Nous Research)', /Copyright \(c\) 2025 Nous Research/],
    ['security-guidance: Apache License 2.0', /Apache License/],
    ['security-guidance: NOTICE', /claude-plugins-official/],
    ['Syne font: SIL Open Font License 1.1', /SIL OPEN FONT LICENSE Version 1\.1/]
  ])('shows the bundled text of "%s" once expanded', async (title, text) => {
    const dialog = openLicenses()

    fireEvent.click(within(dialog).getByRole('button', { name: title }))

    expect(await within(dialog).findByText(text)).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: title }).getAttribute('aria-expanded')).toBe('true')
  })

  it('lists the third-party packages', async () => {
    listIs(PACKAGES)
    const dialog = openLicenses()

    expect(await within(dialog).findByText('react')).toBeTruthy()
    expect(within(dialog).getByText('4.17.21')).toBeTruthy()
    expect(within(dialog).getByText('3 packages')).toBeTruthy()
  })

  it('ships a real third-party list: non-empty, every row with a name, version and license', async () => {
    const actual = await vi.importActual<typeof LicensesData>('./licenses-data')
    const packages = await actual.readPackages()

    expect(packages.length).toBeGreaterThan(100)
    expect(packages.every(p => p.name && p.version && p.license)).toBe(true)
  })

  it('says the list is not available when it is empty or fails to load', async () => {
    listIs([])
    const first = openLicenses()

    expect(await within(first).findByText('List not available')).toBeTruthy()

    cleanup()
    vi.mocked(readPackages).mockRejectedValue(new Error('chunk failed'))
    const second = openLicenses()

    expect(await within(second).findByText('List not available')).toBeTruthy()
  })

  it('filters the list by name or license as you type', async () => {
    listIs(PACKAGES)
    const dialog = openLicenses()

    await within(dialog).findByText('react')
    const search = within(dialog).getByRole('searchbox')

    fireEvent.change(search, { target: { value: 'LODASH' } })
    await waitFor(() => expect(within(dialog).queryByText('react')).toBeNull())
    expect(within(dialog).getByText('lodash')).toBeTruthy()
    expect(within(dialog).getByText('1 of 3 packages')).toBeTruthy()

    fireEvent.change(search, { target: { value: 'apache' } })
    await waitFor(() => expect(within(dialog).getByText('requests')).toBeTruthy())
    expect(within(dialog).queryByText('lodash')).toBeNull()

    fireEvent.change(search, { target: { value: 'zzz' } })
    expect(await within(dialog).findByText('No package matches')).toBeTruthy()
  })

  it('renders a long list a page at a time', async () => {
    listIs(
      Array.from({ length: 1000 }, (_, i) => ({
        name: `pkg-${String(i).padStart(4, '0')}`,
        version: '1.0.0',
        license: 'MIT'
      }))
    )

    const dialog = openLicenses()

    await within(dialog).findByText('pkg-0000')
    expect(within(dialog).getAllByRole('listitem').length).toBeLessThanOrEqual(200)
    expect(within(dialog).queryByText('pkg-0999')).toBeNull()

    fireEvent.click(within(dialog).getByRole('button', { name: /Show more/ }))
    expect(within(dialog).getAllByRole('listitem').length).toBeGreaterThan(200)
  })
})

describe('normalizePackages', () => {
  const { normalizePackages } = actualData

  it('keeps named rows, fills gaps and sorts by name', () => {
    expect(
      normalizePackages([{ name: 'zlib', version: '1', license: 'Zlib' }, { name: 'a' }, { version: '2' }, null, 'x'])
    ).toEqual([
      { name: 'a', version: '', license: '' },
      { name: 'zlib', version: '1', license: 'Zlib' }
    ])
  })

  it.each([[undefined], [null], [{ name: 'react' }], ['<!doctype html>']])('treats %j as no list', data => {
    expect(normalizePackages(data)).toEqual([])
  })
})
