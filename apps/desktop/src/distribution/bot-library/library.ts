import { atom } from 'nanostores'

import { notifyError } from '@/store/notifications'
import { refreshProfiles } from '@/store/profile'

import { installLibraryBot, type LibraryEntry, listBotLibrary, updateLibraryBot } from './api'
import { copy } from './copy'
import type { LibrarySource } from './folders'
import { recordBotDepartment } from './store'

// The library view's data: what each source lists right now and which entries have an install or
// update in flight. The backend is authoritative for status (new / installed / update); this is a
// cache of its last answer, patched in place after our own install or update.

export type ListingState =
  | { status: 'error'; message: string }
  | { status: 'loading' }
  | { entries: LibraryEntry[]; status: 'ready' }

export interface SourceListing {
  source: LibrarySource
  state: ListingState
}

export const $listings = atom<SourceListing[]>([])
/** Entries with an install or update running, by `entryKey`. */
export const $busyEntries = atom<ReadonlySet<string>>(new Set())

let generation = 0

export const entryKey = (source: LibrarySource, entry: LibraryEntry): string => `${source.location}::${entry.name}`

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))

function patchListing(location: string, state: ListingState): void {
  $listings.set($listings.get().map(item => (item.source.location === location ? { ...item, state } : item)))
}

function patchEntry(source: LibrarySource, name: string, patch: Partial<LibraryEntry>): void {
  $listings.set(
    $listings.get().map(item =>
      item.source.location === source.location && item.state.status === 'ready'
        ? {
            ...item,
            state: {
              ...item.state,
              entries: item.state.entries.map(entry => (entry.name === name ? { ...entry, ...patch } : entry))
            }
          }
        : item
    )
  )
}

function setBusy(key: string, busy: boolean): void {
  const next = new Set($busyEntries.get())

  if (busy) {
    next.add(key)
  } else {
    next.delete(key)
  }

  $busyEntries.set(next)
}

/** Lists every source; a source that cannot be read shows its own error and leaves the others alone. */
export async function loadLibrary(sources: LibrarySource[]): Promise<void> {
  const mine = ++generation

  $listings.set(sources.map(source => ({ source, state: { status: 'loading' } })))

  await Promise.all(
    sources.map(async source => {
      const state = await listBotLibrary(source.location).then(
        (listing): ListingState => ({ entries: listing.entries, status: 'ready' }),
        (error: unknown): ListingState => ({ message: messageOf(error), status: 'error' })
      )

      if (mine === generation) {
        patchListing(source.location, state)
      }
    })
  )
}

/** Installs one entry; the department's bots are remembered under it so a department switch can hide them. */
export async function installEntry(source: LibrarySource, entry: LibraryEntry): Promise<boolean> {
  const key = entryKey(source, entry)

  setBusy(key, true)

  try {
    const { profile, version } = await installLibraryBot(entry.source, entry.name)

    if (source.department) {
      recordBotDepartment(profile, source.department)
    }

    patchEntry(source, entry.name, {
      error: null,
      installed_profile: profile,
      installed_version: version,
      status: 'installed'
    })
    void refreshProfiles().catch(() => undefined)

    return true
  } catch (error) {
    notifyError(error, copy.installFailed(entry.name))

    return false
  } finally {
    setBusy(key, false)
  }
}

export async function updateEntry(source: LibrarySource, entry: LibraryEntry): Promise<boolean> {
  const key = entryKey(source, entry)
  const profile = entry.installed_profile

  if (!profile) {
    return false
  }

  setBusy(key, true)

  try {
    const { version } = await updateLibraryBot(profile)

    patchEntry(source, entry.name, { error: null, installed_version: version, status: 'installed' })
    void refreshProfiles().catch(() => undefined)

    return true
  } catch (error) {
    notifyError(error, copy.updateFailed(entry.name))

    return false
  } finally {
    setBusy(key, false)
  }
}

/** Installs entries one after another (a failure does not stop the rest); returns how many went in. */
export async function installAll(source: LibrarySource, entries: LibraryEntry[]): Promise<number> {
  let installed = 0

  for (const entry of entries) {
    installed += (await installEntry(source, entry)) ? 1 : 0
  }

  return installed
}

/** The entries an install can offer: those not installed yet. */
export const installable = (entries: LibraryEntry[]): LibraryEntry[] => entries.filter(entry => entry.status === 'new')
