import type { ReadableAtom } from 'nanostores'

import { botLibraryPolicy } from '..'

import { copy } from './copy'
import { requestDuplicate } from './duplicate'
import { isManagedConfigKey, type LibraryLock, useLibraryLocked } from './locked'
import { $departmentHiddenBots } from './store'

/** What the Bots plugin sees of the library through `ctx.botLibrary` (absent in upstream Hermes). */
export interface PluginBotLibrary {
  /** The words the plugin shows for the lock; the plugin has no catalog of its own for them. */
  copy: {
    duplicateAction: string
    lockNotice: string
    lockTooltip: (version: null | string) => string
  }
  /** Profiles the Bots pane leaves out of its list: installed for another department. Display only. */
  hiddenBots: ReadableAtom<ReadonlySet<string>>
  /** Whether the library overwrites a `config.yaml` key of a locked bot on update. */
  isManagedConfigKey: (lock: LibraryLock, key: string) => boolean
  /** The library button's label. */
  label: string
  /** The in-app route of the library page. */
  path: string
  /** Asks for a name and makes a personal copy of a locked bot; `opened` gets the copy's profile name. */
  requestDuplicate: (profile: string, opened?: (copy: string) => void) => void
  /** A hook: the lock on a local profile (library-installed: its SOUL, shipped skills and jobs and managed config are the library's), or null. */
  useLocked: (profile: string) => LibraryLock | null
}

export function pluginBotLibrary(): PluginBotLibrary | undefined {
  return botLibraryPolicy()
    ? {
        copy: { duplicateAction: copy.duplicateAction, lockNotice: copy.lockNotice, lockTooltip: copy.lockTooltip },
        hiddenBots: $departmentHiddenBots,
        isManagedConfigKey,
        label: copy.libraryTitle,
        path: '/settings?tab=bot-library',
        requestDuplicate,
        useLocked: useLibraryLocked
      }
    : undefined
}
