import type { ReadableAtom } from 'nanostores'

import { botLibraryPolicy } from '..'

import { copy } from './copy'
import { $departmentHiddenBots } from './store'

/** What the Bots plugin sees of the library through `ctx.botLibrary` (absent in upstream Hermes). */
export interface PluginBotLibrary {
  /** Profiles the Bots pane leaves out of its list: installed for another department. Display only. */
  hiddenBots: ReadableAtom<ReadonlySet<string>>
  /** The library button's label. */
  label: string
  /** The in-app route of the library page. */
  path: string
}

export function pluginBotLibrary(): PluginBotLibrary | undefined {
  return botLibraryPolicy() ? { hiddenBots: $departmentHiddenBots, label: copy.libraryTitle, path: '/settings?tab=bot-library' } : undefined
}
