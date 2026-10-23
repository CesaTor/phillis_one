import { atom } from 'nanostores'

import { notify, notifyError } from '@/store/notifications'
import { $profiles, profileLabel, refreshProfiles } from '@/store/profile'

import { duplicateLibraryBot } from './api'
import { copy } from './copy'

// "Duplicate as personal bot": the way out of a library bot's lock. Every surface that shows the
// lock asks here; one dialog (`duplicate-dialog.tsx`, mounted once beside the app) takes the name.

export interface DuplicateRequest {
  /** The bot's name as the person sees it: the base of the default copy name. */
  label: string
  /** Called with the copy's profile name once it exists and the profile list has refreshed. */
  opened?: (copy: string) => void
  profile: string
}

export const $duplicateRequest = atom<DuplicateRequest | null>(null)

export function requestDuplicate(profile: string, opened?: (copy: string) => void): void {
  const row = $profiles.get().find(candidate => candidate.name === profile)
  const label = (row?.bot_title ?? '').trim() || (row ? profileLabel(row) : profile)

  $duplicateRequest.set({ label, opened, profile })
}

export function closeDuplicate(): void {
  $duplicateRequest.set(null)
}

export const defaultCopyName = (label: string): string => copy.duplicateDefaultName(label)

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
    notifyError(error, copy.duplicateFailed)

    return false
  }
}
