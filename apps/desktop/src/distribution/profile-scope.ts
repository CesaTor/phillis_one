import type { WritableAtom } from 'nanostores'

import { sessionsPartAllowed } from '.'

/** Where the profile rail is hidden nothing can pick a profile, so the Sessions pane lists every
 *  profile's chats and stays there: connection switches, `selectProfile` and the toggle keybind all
 *  try to leave it, and each is put straight back. Upstream gets its atom untouched. */
export function holdAllProfiles($showAll: WritableAtom<boolean>): void {
  if (sessionsPartAllowed('profiles')) {
    return
  }

  $showAll.set(true)
  $showAll.subscribe(showAll => !showAll && $showAll.set(true))
}
