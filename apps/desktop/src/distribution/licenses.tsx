import { type ReactElement, useDeferredValue, useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ChevronDown, ChevronRight, FileText } from '@/lib/icons'

import { SectionHeading } from '../app/settings/primitives'

import { readNotice, readPackages, type ThirdPartyPackage } from './licenses-data'

import { licensesScreenAllowed } from '.'

// ReAgent's About ▸ Licenses: the notices that licenses require to travel with a copy of the app
// (MIT: Nous Research's; Apache-2.0: its NOTICE; OFL: its text with the font), readable by someone
// who only has the installed app. Plain English on purpose: legal text is not translated. The texts
// are files in `./licenses/`, `third-party.json` is generated at build time; both are bundled into
// the renderer (see licenses-data.ts), never fetched.

interface Notice {
  file: string
  title: string
}

const NOTICES: readonly Notice[] = [
  { file: 'nous-research-mit.txt', title: 'Hermes Agent: MIT License (Nous Research)' },
  { file: 'security-guidance-apache-2.0.txt', title: 'security-guidance: Apache License 2.0' },
  { file: 'security-guidance-NOTICE.txt', title: 'security-guidance: NOTICE' },
  { file: 'syne-ofl-1.1.txt', title: 'Syne font: SIL Open Font License 1.1' }
]

const PAGE_SIZE = 200

type Loaded<T> = { status: 'error' } | { status: 'loading' } | { status: 'ready'; value: T }

function useBundle<T>(read: () => Promise<T>): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ status: 'loading' })

  useEffect(() => {
    let live = true

    read().then(
      value => live && setState({ status: 'ready', value }),
      () => live && setState({ status: 'error' })
    )

    return () => {
      live = false
    }
    // `read` is a module-level function or a closure over a constant file name.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return state
}

const NOTE = 'text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)'

function NoticeText({ file }: { file: string }): ReactElement {
  const state = useBundle(() => readNotice(file))

  if (state.status === 'ready') {
    return (
      <div className="max-h-72 overflow-auto whitespace-pre-wrap break-words px-3 pb-3 text-[length:var(--conversation-caption-font-size)] leading-relaxed text-(--ui-text-secondary)">
        {state.value}
      </div>
    )
  }

  return <p className={`px-3 pb-3 ${NOTE}`}>{state.status === 'loading' ? 'Loading…' : 'Text not available.'}</p>
}

function NoticeSection({ notice }: { notice: Notice }): ReactElement {
  const [open, setOpen] = useState(false)
  const Caret = open ? ChevronDown : ChevronRight

  return (
    <div className="rounded-md bg-(--ui-bg-quaternary)">
      <button
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-1.5 px-3 py-2 text-left font-medium"
        onClick={() => setOpen(!open)}
        type="button"
      >
        <Caret className="size-3.5 shrink-0 text-muted-foreground" />
        {notice.title}
      </button>
      {open && <NoticeText file={notice.file} />}
    </div>
  )
}

function PackageList({ packages }: { packages: ThirdPartyPackage[] }): ReactElement {
  const [query, setQuery] = useState('')
  const [shown, setShown] = useState(PAGE_SIZE)
  const needle = useDeferredValue(query.trim().toLowerCase())

  const matches = useMemo(
    () =>
      needle
        ? packages.filter(pkg => pkg.name.toLowerCase().includes(needle) || pkg.license.toLowerCase().includes(needle))
        : packages,
    [needle, packages]
  )

  const count = `${matches.length === packages.length ? '' : `${matches.length} of `}${packages.length} packages`

  return (
    <div className="grid gap-2">
      <Input
        aria-label="Search packages"
        onChange={event => {
          setQuery(event.target.value)
          setShown(PAGE_SIZE)
        }}
        placeholder="Search by name or license"
        type="search"
        value={query}
      />
      <p className={NOTE}>{count}</p>
      {matches.length === 0 ? (
        <p className={NOTE}>No package matches</p>
      ) : (
        <ul className="grid">
          {matches.slice(0, shown).map(pkg => (
            <li
              className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-3 py-1"
              key={`${pkg.name}@${pkg.version}`}
            >
              <span className="truncate">{pkg.name}</span>
              <span className={NOTE}>{pkg.version}</span>
              <span className="min-w-16 text-right text-[length:var(--conversation-caption-font-size)]">
                {pkg.license}
              </span>
            </li>
          ))}
        </ul>
      )}
      {matches.length > shown && (
        <Button className="justify-self-start" onClick={() => setShown(shown + PAGE_SIZE)} size="sm" variant="outline">
          Show more ({matches.length - shown} left)
        </Button>
      )}
    </div>
  )
}

function ThirdParty(): ReactElement {
  const state = useBundle(readPackages)

  if (state.status === 'ready' && state.value.length > 0) {
    return <PackageList packages={state.value} />
  }

  return <p className={NOTE}>{state.status === 'loading' ? 'Loading…' : 'List not available'}</p>
}

function LicensesView(): ReactElement {
  return (
    <>
      <p>
        ReAgent is built on Hermes Agent by Nous Research (MIT License). ReQurv&apos;s own parts are © 2026 ReQurv, All
        Rights Reserved.
      </p>
      <div className="grid gap-1.5">
        {NOTICES.map(notice => (
          <NoticeSection key={notice.file} notice={notice} />
        ))}
      </div>
      <h3 className="pt-2 font-medium">Third-party software</h3>
      <ThirdParty />
    </>
  )
}

/** The gate About mounts: nothing in upstream Hermes. */
export function LicensesEntry(): null | ReactElement {
  return licensesScreenAllowed() ? <LicensesSection /> : null
}

/** About's Licenses entry: a heading and a button that opens the notices. */
export function LicensesSection(): ReactElement {
  const [open, setOpen] = useState(false)

  return (
    <section className="mt-6">
      <SectionHeading icon={FileText} title="Licenses" />
      <div className="flex items-center justify-between gap-3">
        <p className={NOTE}>Legal notices for ReAgent and the software it includes.</p>
        <Button onClick={() => setOpen(true)} size="sm" variant="outline">
          View licenses
        </Button>
      </div>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle icon={FileText}>Licenses</DialogTitle>
            <DialogDescription>Notices that travel with this app.</DialogDescription>
          </DialogHeader>
          <LicensesView />
        </DialogContent>
      </Dialog>
    </section>
  )
}
