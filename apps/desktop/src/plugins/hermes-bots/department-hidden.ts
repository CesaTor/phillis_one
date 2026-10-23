import { atom, useValue } from '@hermes/plugin-sdk'

import { getPluginCtx } from './shared'
import type { RosterRow } from './types'

// A distribution with a bot library (`ctx.botLibrary`, ReAgent) hides the bots installed for another
// department. Display only, like hiding a bot: the profile, its chats and its routines are untouched.

const NONE = atom<ReadonlySet<string>>(new Set())

/** Profile names the Bots pane leaves out; always empty where there is no library. */
export function useDepartmentHiddenBots(): ReadonlySet<string> {
  return useValue(getPluginCtx()?.botLibrary?.hiddenBots ?? NONE)
}

/** Library bots are local profiles: a same-named bot on another gateway is a different bot. */
export function isHiddenByDepartment(bot: RosterRow, hidden: ReadonlySet<string>): boolean {
  return !bot.remoteSource && hidden.has(bot.name)
}
