import { hermesApi } from '@/api/client'

// The backend's bot-library routes (`hermes_cli/` profile distributions). Profile-agnostic: the
// library belongs to the install, not to a bot, so none of these carry a profile scope.

export type LibraryEntryStatus = 'error' | 'installed' | 'new' | 'update'

export interface LibraryEnvRequirement {
  description: string
  name: string
  required: boolean
}

export interface LibraryEntry {
  author: string
  description: string
  env_requires: LibraryEnvRequirement[]
  error: null | string
  has_cron: boolean
  installed_profile: null | string
  installed_version: null | string
  name: string
  skills: string[]
  source: string
  status: LibraryEntryStatus
  version: string
}

export interface LibraryListing {
  entries: LibraryEntry[]
  source: string
}

export interface LibraryInstallResult {
  profile: string
  version: string
}

export interface LibraryUpdateResult {
  from_version: string
  profile: string
  version: string
}

export type LibrarySyncStatus = 'error' | 'source-unavailable' | 'unchanged' | 'updated'

export interface LibrarySyncResult {
  error?: string
  from_version: string
  profile: string
  status: LibrarySyncStatus
  to_version: string
}

export interface LibraryRollbackResult {
  profile: string
  version: string
}

// A folder listing walks a synced drive (or clones a repository): well past the 15 s default.
const LIST_TIMEOUT_MS = 60_000

export function listBotLibrary(source: string): Promise<LibraryListing> {
  return hermesApi<LibraryListing>({
    path: `/api/bot-library?source=${encodeURIComponent(source)}`,
    timeoutMs: LIST_TIMEOUT_MS
  })
}

export function installLibraryBot(source: string, name?: string): Promise<LibraryInstallResult> {
  return hermesApi<LibraryInstallResult>({
    body: name ? { name, source } : { source },
    method: 'POST',
    path: '/api/bot-library/install',
    timeoutMs: LIST_TIMEOUT_MS
  })
}

export function updateLibraryBot(profile: string): Promise<LibraryUpdateResult> {
  return hermesApi<LibraryUpdateResult>({
    body: { profile },
    method: 'POST',
    path: '/api/bot-library/update',
    timeoutMs: LIST_TIMEOUT_MS
  })
}

export function syncLibraryBots(): Promise<{ results: LibrarySyncResult[] }> {
  return hermesApi<{ results: LibrarySyncResult[] }>({
    method: 'POST',
    path: '/api/bot-library/sync',
    timeoutMs: LIST_TIMEOUT_MS
  })
}

export function rollbackLibraryBot(profile: string): Promise<LibraryRollbackResult> {
  return hermesApi<LibraryRollbackResult>({
    body: { profile },
    method: 'POST',
    path: '/api/bot-library/rollback',
    timeoutMs: LIST_TIMEOUT_MS
  })
}
