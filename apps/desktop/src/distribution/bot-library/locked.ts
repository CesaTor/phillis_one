import { useStore } from '@nanostores/react'

import { $profiles } from '@/store/profile'
import type { ProfileInfo } from '@/types/hermes'

// Library-installed bots are locked: each library update overwrites their SOUL, shipped skills,
// shipped scheduled jobs and the `config.yaml` keys the library manages, so an edit to any of those
// would be lost silently. The backend refuses such edits (HTTP 409); the UI reads the same flag
// from `/api/profiles` and shows those controls read-only, with a Duplicate as the way out.
// Everything else on the bot (name, look, description, skill enable/disable, deleting it) is the
// person's. One predicate here so each upstream surface needs a one-line gate.

export interface LibraryLock {
  /** `config.yaml` keys (dotted) the library keeps authoritative on update. */
  managedConfig: readonly string[]
  /** The library version the bot was installed from, when the backend says. */
  version: null | string
}

type LockFields = Pick<ProfileInfo, 'distribution_version' | 'library_locked' | 'library_managed_config'>

/** The lock on a profile row, or null for an ordinary (or remote, unflagged) bot. */
export function libraryLockOf(profile: LockFields | null | undefined): LibraryLock | null {
  return profile?.library_locked
    ? { managedConfig: profile.library_managed_config ?? [], version: profile.distribution_version ?? null }
    : null
}

/** The lock on a local profile by name; re-renders when the profile list changes. */
export function useLibraryLocked(profileName: null | string | undefined): LibraryLock | null {
  const profiles = useStore($profiles)

  return libraryLockOf(profileName ? profiles.find(profile => profile.name === profileName) : null)
}

/** Whether the library overwrites `key` (or something inside it, or the key sits inside a managed one). */
export function isManagedConfigKey(lock: Pick<LibraryLock, 'managedConfig'> | null | undefined, key: string): boolean {
  return Boolean(
    lock?.managedConfig.some(managed => managed === key || managed.startsWith(`${key}.`) || key.startsWith(`${managed}.`))
  )
}
