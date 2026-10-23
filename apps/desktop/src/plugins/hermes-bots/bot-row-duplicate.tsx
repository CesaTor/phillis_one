import { ContextMenuItem, host, queryClient } from '@hermes/plugin-sdk'

import { $lastRoster, ROSTER_KEY } from './data'
import { useBots } from './i18n'
import { displayName } from './labels'
import type { BotLibraryLock } from './library-lock'
import { duplicateBot } from './profile-ops'
import type { BotMeta, RosterRow } from './types'

/** The row menu's Duplicate: a full clone of an ordinary bot, the personal copy of a library bot. */
export function BotDuplicateMenuItem({
  bot,
  lock,
  meta
}: {
  bot: RosterRow
  lock: BotLibraryLock | null
  meta: BotMeta | null | undefined
}) {
  const b = useBots()

  const duplicate = () => {
    host.notify({
      kind: 'info',
      message: `Duplicating ${displayName(bot, meta)}…`
    })
    duplicateBot(bot, $lastRoster.get())
      .then(name => {
        queryClient.invalidateQueries({
          queryKey: ROSTER_KEY
        })
        host.notify({
          kind: 'success',
          message: `Created ${name} — full copy of ${bot.name}`
        })
      })
      .catch(err => host.notifyError(err, b.bot.duplicateFailed))
  }

  return (
    <ContextMenuItem onSelect={lock ? lock.duplicate : duplicate}>{lock?.duplicateLabel ?? b.bot.duplicate}</ContextMenuItem>
  )
}
