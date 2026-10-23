import { useStore } from '@nanostores/react'
import { type ReactElement, useEffect } from 'react'

import { Button } from '@/components/ui/button'
import { Loader2 } from '@/lib/icons'

import { Pill } from '../../app/settings/primitives'

import type { LibraryEntry, LibraryEntryStatus } from './api'
import { copy } from './copy'
import { librarySources } from './folders'
import type { LibrarySource } from './folders'
import {
  $busyEntries,
  $listings,
  entryKey,
  installEntry,
  loadLibrary,
  type SourceListing,
  updateEntry
} from './library'
import { $department, $libraryRoot } from './store'

const CAPTION = 'text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)'

const STATUS_TONE = { error: 'destructive', installed: 'success', new: 'primary', update: 'warn' } as const

export function StatusChip({ status }: { status: LibraryEntryStatus }): ReactElement {
  return <Pill tone={STATUS_TONE[status]}>{copy.status[status]}</Pill>
}

function Detail({ label, children }: { children: string; label: string }): ReactElement {
  return (
    <div className="flex gap-1.5">
      <dt className="shrink-0 text-(--ui-text-quaternary)">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}

/** What an entry brings, shown before anything is installed. */
function EntryDetails({ entry }: { entry: LibraryEntry }): ReactElement {
  const credentials = entry.env_requires.map(
    item => `${item.name} (${item.required ? copy.credentialRequired : copy.credentialOptional})`
  )

  return (
    <dl className={`grid gap-0.5 ${CAPTION}`}>
      <Detail label={copy.skills}>{entry.skills.join(', ') || copy.skillsNone}</Detail>
      <Detail label={copy.scheduledJobs}>{entry.has_cron ? copy.yes : copy.no}</Detail>
      <Detail label={copy.credentials}>{credentials.join(', ') || copy.credentialsNone}</Detail>
    </dl>
  )
}

interface EntryActionProps {
  busy: boolean
  entry: LibraryEntry
  source: LibrarySource
}

function EntryAction({ busy, entry, source }: EntryActionProps): ReactElement | null {
  if (entry.status === 'new' || entry.status === 'update') {
    const update = entry.status === 'update'

    return (
      <Button
        disabled={busy}
        onClick={() => void (update ? updateEntry(source, entry) : installEntry(source, entry))}
        size="sm"
        variant={update ? 'outline' : 'default'}
      >
        {busy && <Loader2 className="animate-spin" />}
        {update ? (busy ? copy.updating : copy.update) : busy ? copy.installing : copy.install}
      </Button>
    )
  }

  return null
}

export function EntryRow({ busy, entry, source }: EntryActionProps): ReactElement {
  return (
    <li className="grid gap-1.5 rounded-md bg-(--ui-bg-quaternary) px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-medium">{entry.name}</span>
        <span className={CAPTION}>{copy.version(entry.version)}</span>
        <StatusChip status={entry.status} />
        <EntryAction busy={busy} entry={entry} source={source} />
      </div>
      {entry.description && <p className="text-sm text-(--ui-text-secondary)">{entry.description}</p>}
      {entry.status === 'error' && entry.error && <p className="text-xs text-destructive">{entry.error}</p>}
      <EntryDetails entry={entry} />
    </li>
  )
}

function ListingSection({ busy, listing }: { busy: ReadonlySet<string>; listing: SourceListing }): ReactElement {
  const { source, state } = listing

  return (
    <section className="grid gap-2">
      <h3 className="text-sm font-medium">{source.label}</h3>
      {state.status === 'loading' && <p className={CAPTION}>{copy.loading}</p>}
      {state.status === 'error' && (
        <p className="text-sm text-destructive">{copy.sourceFailed(source.label, state.message)}</p>
      )}
      {state.status === 'ready' && state.entries.length === 0 && <p className={CAPTION}>{copy.noBots}</p>}
      {state.status === 'ready' && state.entries.length > 0 && (
        <ul className="grid gap-2">
          {state.entries.map(entry => (
            <EntryRow busy={busy.has(entryKey(source, entry))} entry={entry} key={entry.name} source={source} />
          ))}
        </ul>
      )}
    </section>
  )
}

/** The current department's certified bots and the base catalog, with status and install/update. */
export function BotLibraryView(): ReactElement {
  const root = useStore($libraryRoot)
  const department = useStore($department)
  const listings = useStore($listings)
  const busy = useStore($busyEntries)
  const sources = librarySources(root, department)
  const sourcesKey = sources.map(source => source.location).join('\n')

  useEffect(() => {
    void loadLibrary(librarySources(root, department))
    // `sourcesKey` is the identity of the sources; the arrays are rebuilt every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourcesKey])

  return (
    <div className="grid gap-5">
      {!root && <p className={CAPTION}>{copy.noLibraryFolder}</p>}
      {listings.map(listing => (
        <ListingSection busy={busy} key={listing.source.location} listing={listing} />
      ))}
    </div>
  )
}
