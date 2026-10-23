import { useStore } from '@nanostores/react'
import { type ReactElement, useState } from 'react'

import { Button } from '@/components/ui/button'
import { FolderOpen, Package } from '@/lib/icons'

import { SectionHeading, SettingsContent } from '../../app/settings/primitives'

import { copy } from './copy'
import { DepartmentList } from './department-list'
import { pickLibraryFolder, useDepartments } from './folder-pick'
import { BotLibraryView } from './library-view'
import { $department, $libraryRoot, setDepartment, setLibraryRoot } from './store'

const CAPTION = 'text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)'

function FolderRow(): ReactElement {
  const root = useStore($libraryRoot)

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-sm">{root ?? copy.noLibraryFolder}</p>
        <p className={CAPTION}>{copy.libraryFolderHint}</p>
      </div>
      <Button
        onClick={() => void pickLibraryFolder(root).then(picked => picked && setLibraryRoot(picked))}
        size="sm"
        variant="outline"
      >
        <FolderOpen />
        {root ? copy.change : copy.chooseFolder}
      </Button>
    </div>
  )
}

function DepartmentRow(): ReactElement {
  const root = useStore($libraryRoot)
  const department = useStore($department)
  const [choosing, setChoosing] = useState(false)
  const [draft, setDraft] = useState<null | string>(null)
  const departments = useDepartments(choosing ? root : null)

  const close = () => {
    setChoosing(false)
    setDraft(null)
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm">{department ?? '—'}</p>
          <p className={CAPTION}>{copy.departmentHint}</p>
        </div>
        {!choosing && (
          <Button disabled={!root} onClick={() => setChoosing(true)} size="sm" variant="outline">
            {copy.changeDepartment}
          </Button>
        )}
      </div>
      {choosing && (
        <>
          <DepartmentList onChange={setDraft} state={departments} value={draft ?? department} />
          <div className="flex justify-end gap-2">
            <Button onClick={close} size="sm" variant="text">
              {copy.cancel}
            </Button>
            <Button
              disabled={!draft || draft === department}
              onClick={() => {
                setDepartment(draft)
                close()
              }}
              size="sm"
            >
              {copy.save}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

/** Settings ▸ Bot Library: the folder and department this install follows, and the library itself. */
export function BotLibrarySettings(): ReactElement {
  return (
    <SettingsContent>
      <div className="mx-auto grid w-full max-w-2xl gap-6">
        <p className={CAPTION}>{copy.libraryIntro}</p>
        <section>
          <SectionHeading icon={FolderOpen} title={copy.libraryFolder} />
          <FolderRow />
        </section>
        <section>
          <SectionHeading icon={Package} title={copy.department} />
          <DepartmentRow />
        </section>
        <BotLibraryView />
      </div>
    </SettingsContent>
  )
}
