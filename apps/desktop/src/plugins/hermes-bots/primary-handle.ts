/**
 * The primary (`default`) profile's @handle.
 *
 * Two vocabularies meet here. The BACKEND alias is fixed: every backend
 * resolver maps `hermes` to `default` (tools/bot_mode_dm.py `message_agent`,
 * tui_gateway/methods_bot_relay.py, gateway/session_bot.py) and backend copy
 * stamps the primary with it (tools/bot_mode_probe.py teammate roster and DM
 * sender stamps). The handle people SEE and TYPE is the host's
 * (`ctx.defaultBotHandle`; a distribution may rename it, upstream keeps
 * `hermes`). Where they differ, the backend alias stays a silent alias: agents
 * keep writing it from their own prompts, and older room transcripts and
 * persisted group descriptors carry it.
 */

import { getPluginCtx } from './shared'
import type { RosterRow } from './types'

export const BACKEND_PRIMARY_HANDLE = 'hermes'

/** The handle the primary profile is shown, completed and tagged as. */
export function primaryBotHandle(): string {
  return getPluginCtx()?.defaultBotHandle || BACKEND_PRIMARY_HANDLE
}

/** Whether a row is this source's primary under its bare handle: profile `default` with no
 *  source-qualified handle (`default-vera` is another machine's default), or a stored
 *  descriptor carrying either form of the primary handle. */
export function isPrimaryHandleRow(name: null | string | undefined, bot?: Partial<RosterRow> | null): boolean {
  if ((name || '').trim().toLowerCase() !== 'default') {
    return false
  }

  const handle = String(bot?.handle || '').toLowerCase()

  return !handle || handle === 'default' || handle === BACKEND_PRIMARY_HANDLE || handle === primaryBotHandle()
}

/** Silent @-forms a row also answers to: the backend alias, for the primary when it shows another. */
export function primaryHandleAliases(name: null | string | undefined, bot?: Partial<RosterRow> | null): string[] {
  return isPrimaryHandleRow(name, bot) && primaryBotHandle() !== BACKEND_PRIMARY_HANDLE ? [BACKEND_PRIMARY_HANDLE] : []
}

/** The handle a backend resolver accepts for a row (relay roster rows, `message_agent` targets). */
export function backendBotHandle(name: null | string | undefined, bot?: Partial<RosterRow> | null): string {
  if (isPrimaryHandleRow(name, bot)) {
    return BACKEND_PRIMARY_HANDLE
  }

  return bot?.handle && bot.handle !== name ? bot.handle : String(name || '')
}
