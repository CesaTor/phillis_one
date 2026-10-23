import { notify } from '@/store/notifications'
import { $profiles, profileLabel, refreshProfiles } from '@/store/profile'
import { isMainWindow } from '@/store/windows'

import { type LibrarySyncResult, syncLibraryBots } from './api'
import { copy } from './copy'

// Once per launch, after the backend is up: bring every library-installed bot up to date from its
// source. The backend does the work (`POST /api/bot-library/sync`); this tells the person what changed
// and keeps everything else quiet: an unreachable source (the Drive not mounted yet) is not news.

/** One toast line for the bots that were updated, or null when none were. */
export function syncSummary(results: LibrarySyncResult[], labelOf: (profile: string) => string): null | string {
  const updated = results.filter(result => result.status === 'updated')

  if (updated.length === 0) {
    return null
  }

  if (updated.length === 1) {
    return copy.updatedTo(labelOf(updated[0].profile), updated[0].to_version)
  }

  return copy.updatedMany(updated.map(result => `${labelOf(result.profile)} ${result.to_version}`))
}

function labelOfProfile(profile: string): string {
  const row = $profiles.get().find(candidate => candidate.name === profile)

  return row ? profileLabel(row) : profile
}

export async function runLibrarySync(): Promise<void> {
  try {
    const { results } = await syncLibraryBots()

    for (const result of results.filter(item => item.status === 'error' || item.status === 'source-unavailable')) {
      console.info('[bot-library] sync', result.profile, result.status, result.error ?? '')
    }

    const message = syncSummary(results, labelOfProfile)

    if (message) {
      notify({ kind: 'success', message })
      void refreshProfiles().catch(() => undefined)
    }
  } catch (error) {
    console.info('[bot-library] sync skipped', error)
  }
}

let started = false

/** Waits for the profile list (the backend answers and owns a `default` home), then syncs once per launch. */
export function startBotLibrarySync(): void {
  if (!isMainWindow()) {
    return
  }

  $profiles.subscribe(profiles => {
    if (started || profiles.length === 0) {
      return
    }

    started = true
    void runLibrarySync()
  })
}
