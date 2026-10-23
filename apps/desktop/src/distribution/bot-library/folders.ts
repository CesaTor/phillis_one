import { readDesktopDir } from '@/lib/desktop-fs'

import { botLibraryPolicy } from '..'

// The folder convention (`BotLibraryPolicy` in distribution/index.ts) resolved to paths. The
// backend scans one folder for bots; the renderer only has to name the right one and list the
// department folders, which the existing local directory listing answers (no library route).

export interface LibrarySource {
  /** A folder on disk or a repository URL, as the backend's `source` parameter. */
  location: string
  /** The name shown for it. */
  label: string
  /** The department its bots are installed for; null = every department (the base catalog). */
  department: null | string
}

function separatorOf(root: string): string {
  return root.includes('\\') && !root.includes('/') ? '\\' : '/'
}

export function joinPath(root: string, ...parts: string[]): string {
  const sep = separatorOf(root)

  return [root.replace(/[\\/]+$/, ''), ...parts].join(sep)
}

/** The department names under `<root>/<departmentsFolder>/`; throws when the folder cannot be read. */
export async function listDepartments(root: string): Promise<string[]> {
  const policy = botLibraryPolicy()

  if (!policy) {
    return []
  }

  const { entries, error } = await readDesktopDir(joinPath(root, policy.departmentsFolder))

  if (error) {
    throw new Error(error)
  }

  return entries
    .filter(entry => entry.isDirectory && !entry.name.startsWith('.'))
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b))
}

/** Where a department's certified bots live. */
export function departmentSource(root: string, department: string): LibrarySource | null {
  const policy = botLibraryPolicy()

  return policy
    ? {
        department,
        label: department,
        location: joinPath(root, policy.departmentsFolder, department, policy.botsFolder)
      }
    : null
}

export function baseCatalogSource(): LibrarySource | null {
  const policy = botLibraryPolicy()

  return policy ? { department: null, label: policy.baseCatalogLabel, location: policy.baseCatalogUrl } : null
}

/** The sources the library lists for a department: its own folder (when a library root is set) and the base catalog. */
export function librarySources(root: null | string, department: null | string): LibrarySource[] {
  const own = root && department ? departmentSource(root, department) : null

  return [own, baseCatalogSource()].filter((source): source is LibrarySource => source !== null)
}
