import { useStore } from '@nanostores/react'
import { type ReactElement, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { FolderOpen, Loader2 } from '@/lib/icons'
import { $desktopOnboarding } from '@/store/onboarding'
import { $onboardingSurfaceClear } from '@/store/onboarding-presence'
import { isMainWindow } from '@/store/windows'

import { botLibraryPolicy } from '..'

import type { LibraryEntry } from './api'
import { copy } from './copy'
import { DepartmentList } from './department-list'
import { pickLibraryFolder, useDepartments } from './folder-pick'
import { type LibrarySource, librarySources, listDepartments } from './folders'
import { $listings, entryKey, installable, installEntry, loadLibrary, type SourceListing } from './library'
import { $department, $libraryOnboardingSkipped, $libraryRoot, setDepartment, setLibraryRoot, skipLibraryOnboarding } from './store'

// First run in ReAgent: after the provider is set up, pick the organization's library folder and your
// department, then install the department's bots (and the standard ones). Blocking but plain: the app
// behind is not usable as intended without it, and "Skip for now" is there for a person with no folder.

const CAPTION = 'text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)'

interface Offer {
  entry: LibraryEntry
  key: string
  source: LibrarySource
}

const offersOf = (listings: SourceListing[]): Offer[] =>
  listings.flatMap(({ source, state }) =>
    state.status === 'ready'
      ? installable(state.entries).map(entry => ({ entry, key: entryKey(source, entry), source }))
      : []
  )

function Card({ children, title, hint }: { children: React.ReactNode; hint: string; title: string }): ReactElement {
  return (
    <div className="fixed inset-0 z-(--z-onboarding) flex items-center justify-center bg-(--ui-chat-surface-background) p-6" data-glass-opaque="">
      <div className="relative w-full max-w-[45rem] overflow-hidden rounded-xl border border-(--stroke-nous) bg-(--ui-chat-bubble-background) shadow-nous">
        <div className="px-5 pt-5 pb-1">
          <h2 className="text-[0.9375rem] font-semibold tracking-tight">{title}</h2>
          <p className="mt-1 max-w-xl text-[0.8125rem] leading-5 text-(--ui-text-tertiary)">{hint}</p>
        </div>
        <div className="grid gap-3 p-5">{children}</div>
      </div>
    </div>
  )
}

function SkipButton(): ReactElement {
  return (
    <Button onClick={skipLibraryOnboarding} size="sm" variant="text">
      {copy.notNow}
    </Button>
  )
}

function FolderStep(): ReactElement {
  const [error, setError] = useState<null | string>(null)

  // The folder is only kept once it has the departments folder in it: a wrong pick says so right here.
  const choose = async () => {
    const picked = await pickLibraryFolder($libraryRoot.get())

    if (!picked) {
      return
    }

    try {
      await listDepartments(picked)
      setError(null)
      setLibraryRoot(picked)
    } catch {
      setError(copy.departmentsFolderMissing(botLibraryPolicy()?.departmentsFolder ?? ''))
    }
  }

  return (
    <Card hint={copy.onboardingFolderHint} title={copy.onboardingFolderTitle}>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center justify-between">
        <SkipButton />
        <Button onClick={() => void choose()}>
          <FolderOpen />
          {copy.chooseFolder}
        </Button>
      </div>
    </Card>
  )
}

function DepartmentStep({ onPick, root }: { onPick: (department: string) => void; root: string }): ReactElement {
  const departments = useDepartments(root)
  const [value, setValue] = useState<null | string>(null)

  return (
    <Card hint={copy.libraryFolderHint} title={copy.onboardingDepartmentTitle}>
      <DepartmentList onChange={setValue} state={departments} value={value} />
      <div className="flex items-center justify-between">
        <Button onClick={() => setLibraryRoot(null)} size="sm" variant="text">
          {copy.changeFolder}
        </Button>
        <Button disabled={!value} onClick={() => value && onPick(value)}>
          {copy.continue}
        </Button>
      </div>
    </Card>
  )
}

function BotsStep({ department, root }: { department: string; root: string }): ReactElement {
  const listings = useStore($listings)
  const offers = offersOf(listings)
  const loading = listings.some(({ state }) => state.status === 'loading')
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set())
  const [installing, setInstalling] = useState(false)
  const chosen = offers.filter(offer => !unticked.has(offer.key))

  useEffect(() => {
    void loadLibrary(librarySources(root, department))
  }, [department, root])

  const finish = async () => {
    setInstalling(true)

    for (const { entry, source } of chosen) {
      await installEntry(source, entry)
    }

    setDepartment(department)
  }

  const toggle = (key: string) => {
    const next = new Set(unticked)

    if (!next.delete(key)) {
      next.add(key)
    }

    setUnticked(next)
  }

  return (
    <Card hint={copy.onboardingBotsHint} title={copy.onboardingBotsTitle}>
      {loading && <p className={CAPTION}>{copy.loading}</p>}
      {listings.map(({ source, state }) =>
        // The standard catalog is a bonus here: when it cannot be read the department's bots are what
        // matters, and the Library view in Settings is where that is spelled out.
        state.status === 'error' && source.department !== null ? (
          <p className="text-sm break-words text-destructive" key={source.location}>
            {copy.sourceFailed(source.label, state.message)}
          </p>
        ) : null
      )}
      {!loading && offers.length === 0 && <p className={CAPTION}>{copy.noBots}</p>}
      <ul className="grid max-h-80 gap-1.5 overflow-y-auto">
        {offers.map(({ entry, key, source }) => (
          <li key={key}>
            <label className="flex cursor-pointer items-start gap-2.5 rounded-md bg-(--ui-bg-quaternary) px-3 py-2">
              <Checkbox checked={!unticked.has(key)} disabled={installing} onCheckedChange={() => toggle(key)} />
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="flex items-baseline gap-2">
                  <span className="truncate text-sm font-medium">{entry.name}</span>
                  <span className={CAPTION}>{copy.version(entry.version)}</span>
                  {!source.department && <span className={CAPTION}>{source.label}</span>}
                </span>
                {entry.description && <span className="text-xs text-(--ui-text-secondary)">{entry.description}</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between">
        <Button disabled={installing} onClick={() => setDepartment(department)} size="sm" variant="text">
          {copy.skipInstall}
        </Button>
        <Button disabled={installing || loading} onClick={() => void finish()}>
          {installing && <Loader2 className="animate-spin" />}
          {chosen.length > 0 ? copy.installSelected(chosen.length) : copy.continue}
        </Button>
      </div>
    </Card>
  )
}

function Steps(): ReactElement {
  const root = useStore($libraryRoot)
  const [department, setPicked] = useState<null | string>(null)

  if (!root) {
    return <FolderStep />
  }

  return department ? <BotsStep department={department} root={root} /> : <DepartmentStep onPick={setPicked} root={root} />
}

/** Mounted once beside the app; shows in ReAgent's main window, once first-run provider setup is out of the way. */
export function BotLibraryOnboarding(): null | ReactElement {
  const department = useStore($department)
  const skipped = useStore($libraryOnboardingSkipped)
  const providerReady = useStore($desktopOnboarding).configured === true
  const clear = useStore($onboardingSurfaceClear)

  return botLibraryPolicy() && isMainWindow() && !department && !skipped && providerReady && clear ? <Steps /> : null
}
