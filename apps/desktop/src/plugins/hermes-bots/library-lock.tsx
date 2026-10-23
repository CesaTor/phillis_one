import { Button, Codicon, queryClient, Tip } from '@hermes/plugin-sdk'
import type { ReactNode } from 'react'

import { ROSTER_KEY } from './data'
import type { CapabilityEntry } from './profile-config'
import { getPluginCtx } from './shared'
import type { RosterRow } from './types'

// A bot installed from the organization's library (`ctx.botLibrary`, ReAgent) is locked: the library
// overwrites its SOUL, shipped skills, shipped scheduled jobs and managed config keys on every update,
// so those controls show read-only here and the way to change them is a personal copy. Everything the
// library does not own (name, look, description, skill on/off, deleting the bot) stays editable.
// Builds without a library never get a lock, so every gate below is a no-op there.

export interface BotLibraryLock {
  /** Starts "Duplicate as personal bot" and opens the copy when it exists. */
  duplicate: () => void
  /** The label of the duplicate action. */
  duplicateLabel: string
  /** Whether the library overwrites this `config.yaml` key on update. */
  managed: (configKey: string) => boolean
  /** The one notice every locked surface shows. */
  notice: string
  /** The badge tooltip: the lock and the library version. */
  tooltip: string
}

const NO_LOCK = () => null

/** The lock on a roster bot, or null: a bot of another gateway is not the local library bot of the same name. */
export function useBotLibraryLock(bot: null | Pick<RosterRow, 'name' | 'remoteSource'> | undefined): BotLibraryLock | null {
  const library = getPluginCtx()?.botLibrary
  const lock = (library?.useLocked ?? NO_LOCK)(bot && !bot.remoteSource ? bot.name : '')

  if (!library || !lock || !bot) {
    return null
  }

  return {
    duplicate: () =>
      library.requestDuplicate(bot.name, name => {
        void queryClient.invalidateQueries({ queryKey: ROSTER_KEY })
        // Late: the open path pulls in the whole roster graph, which the editor's own tests do not carry.
        void import('./roster-actions').then(({ openRosterBot }) => openRosterBot({ name }))
      }),
    duplicateLabel: library.copy.duplicateAction,
    managed: key => library.isManagedConfigKey(lock, key),
    notice: library.copy.lockNotice,
    tooltip: library.copy.lockTooltip(lock.version)
  }
}

/** The small lock beside a locked bot's name in the Bots pane. */
export function LibraryLockBadge({ lock }: { lock: BotLibraryLock | null }) {
  return lock ? (
    <Tip label={lock.tooltip}>
      <Codicon aria-label={lock.notice} className="shrink-0 text-[0.6875rem] text-(--ui-text-quaternary)" name="lock" />
    </Tip>
  ) : null
}

/** The consistent notice, with the way out. */
export function LibraryLockNotice({ lock }: { lock: BotLibraryLock | null }) {
  return lock ? (
    <div className="grid justify-items-start gap-2 rounded-md border border-(--ui-stroke-secondary) px-3 py-2 text-xs leading-5 text-(--ui-text-tertiary)">
      <span className="flex min-w-0 items-start gap-1.5">
        <Codicon className="mt-0.5 shrink-0" name="lock" />
        {lock.notice}
      </span>
      <Button onClick={lock.duplicate} size="sm" variant="secondary">
        {lock.duplicateLabel}
      </Button>
    </div>
  ) : null
}

/** Disables every control inside it while `locked`; the native `<fieldset disabled>` does it for inputs, buttons and menus alike. */
export function LockedFields({ children, locked }: { children: ReactNode; locked: boolean }) {
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0" disabled={locked}>
      {children}
    </fieldset>
  )
}

/** MCP servers the library manages: listed, not editable. */
export function ReadOnlyMcpList({ servers }: { servers: CapabilityEntry[] }) {
  const configured = servers.filter(server => !server.fromCatalog)

  return (
    <div className="grid gap-1 p-2 text-xs text-(--ui-text-secondary)">
      {configured.length === 0 ? (
        <span className="text-center text-(--ui-text-tertiary)">—</span>
      ) : (
        configured.map(server => (
          <div className="flex min-w-0 items-baseline gap-2" key={server.name}>
            <span className="truncate">{server.name}</span>
            {server.description ? (
              <span className="truncate text-[0.65rem] text-(--ui-text-quaternary)">{server.description}</span>
            ) : null}
          </div>
        ))
      )}
    </div>
  )
}
