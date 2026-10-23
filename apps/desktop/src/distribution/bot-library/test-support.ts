import { vi } from 'vitest'

import type { LibraryEntry } from './api'

/** The preload bridge the REST helpers go through; `api` answers `hermes:api` requests. */
export function mockApi(api: (request: { body?: unknown; method?: string; path: string }) => unknown) {
  const fn = vi.fn(async (request: { body?: unknown; method?: string; path: string }) => api(request))

  Object.defineProperty(window, 'hermesDesktop', { configurable: true, value: { api: fn } })

  return fn
}

export function libraryEntry(overrides: Partial<LibraryEntry> = {}): LibraryEntry {
  return {
    author: 'Sales ops',
    description: 'Drafts proposals',
    env_requires: [],
    error: null,
    has_cron: false,
    installed_profile: null,
    installed_version: null,
    name: 'proposals',
    skills: [],
    source: '/Drive/Reparti/Sales/Biblioteca agenti/proposals',
    status: 'new',
    version: '1.0',
    ...overrides
  }
}
