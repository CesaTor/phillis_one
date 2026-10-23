import { useEffect, useState } from 'react'

import { selectDesktopPaths } from '@/lib/desktop-fs'

import { botLibraryPolicy } from '..'

import { copy } from './copy'
import { listDepartments } from './folders'

/** The native folder picker (the same one project folders use); null when cancelled. */
export async function pickLibraryFolder(current: null | string): Promise<null | string> {
  const [picked] = await selectDesktopPaths({
    defaultPath: current ?? undefined,
    directories: true,
    title: copy.chooseLibraryFolder
  })

  return picked ?? null
}

export type DepartmentsState =
  | { status: 'error'; message: string }
  | { status: 'idle' }
  | { departments: string[]; status: 'ready' }
  | { status: 'loading' }

/** The departments under a library folder; an unreadable or wrong folder says so in words. */
export function useDepartments(root: null | string): DepartmentsState {
  const [state, setState] = useState<DepartmentsState>({ status: 'idle' })

  useEffect(() => {
    if (!root) {
      setState({ status: 'idle' })

      return
    }

    let live = true

    setState({ status: 'loading' })
    listDepartments(root).then(
      departments => live && setState({ departments, status: 'ready' }),
      () => live && setState({ message: copy.departmentsFolderMissing(botLibraryPolicy()?.departmentsFolder ?? ''), status: 'error' })
    )

    return () => {
      live = false
    }
  }, [root])

  return state
}
