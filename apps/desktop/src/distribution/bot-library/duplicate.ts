import { atom } from 'nanostores'

import { notify } from '@/store/notifications'
import { $profiles, profileLabel, refreshProfiles } from '@/store/profile'

import { duplicateLibraryBot } from './api'
import { copy } from './copy'
import { notifyLibraryError } from './errors'

// "Duplicate as personal bot": the way out of a library bot's lock. Every surface that shows the
// lock asks here; one dialog (`duplicate-dialog.tsx`, mounted once beside the app) takes the name.

export interface DuplicateRequest {
  /** The name the copy starts with in the dialog: the bot's own title when it has one, else its name. */
  defaultName: string
  /** The bot's name as the person sees it. */
  label: string
  /** Called with the copy's profile name once it exists and the profile list has refreshed. */
  opened?: (copy: string) => void
  profile: string
}

export const $duplicateRequest = atom<DuplicateRequest | null>(null)

export function requestDuplicate(profile: string, opened?: (copy: string) => void): void {
  const row = $profiles.get().find(candidate => candidate.name === profile)
  const title = (row?.bot_title ?? '').trim()
  const label = title || (row ? profileLabel(row) : profile)

  $duplicateRequest.set({ defaultName: title || profile, label, opened, profile })
}

export function closeDuplicate(): void {
  $duplicateRequest.set(null)
}

export const defaultCopyName = (request: DuplicateRequest): string => copy.duplicateDefaultName(request.defaultName)

/** Makes the copy. A refusal (a 400 for a taken name, a 409 for a bot the library no longer knows)
 *  is shown as the backend worded it and the dialog stays open for another try. */
export async function runDuplicate(request: DuplicateRequest, name: string): Promise<boolean> {
  try {
    const { profile } = await duplicateLibraryBot(request.profile, name.trim())

    await refreshProfiles().catch(() => undefined)
    closeDuplicate()
    notify({ kind: 'success', message: copy.duplicateCreated(name.trim()) })
    request.opened?.(profile)

    return true
  } catch (error) {
    notifyLibraryError(error, copy.duplicateFailed)

    return false
  }
}
