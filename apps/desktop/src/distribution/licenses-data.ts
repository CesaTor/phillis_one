// Where the Licenses screen's data comes from: bundled into the renderer (`?raw` / JSON imports),
// never fetched, because the packaged app runs from file:// where Chromium can block local fetches.
// Both are globs so a missing file is an empty map, not a build error; the screen then says "not available".

export interface ThirdPartyPackage {
  license: string
  name: string
  version: string
}

// Lazy: each text is its own chunk, loaded when its section is expanded.
const notices = import.meta.glob<string>('./licenses/*.txt', { query: '?raw', import: 'default' })

// Generated at build time (scripts/licenses): array of { name, version, license, source, url }.
const thirdParty = import.meta.glob<unknown>('./licenses/third-party.json', { import: 'default' })

export async function readNotice(file: string): Promise<string> {
  const load = notices[`./licenses/${file}`]

  if (!load) {
    throw new Error(`${file}: not bundled`)
  }

  return load()
}

export function normalizePackages(list: unknown): ThirdPartyPackage[] {
  if (!Array.isArray(list)) {
    return []
  }

  return list
    .filter((row): row is Record<string, unknown> => typeof row?.name === 'string')
    .map(row => ({
      license: typeof row.license === 'string' ? row.license : '',
      name: row.name as string,
      version: typeof row.version === 'string' ? row.version : ''
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function readPackages(): Promise<ThirdPartyPackage[]> {
  const load = thirdParty['./licenses/third-party.json']

  return normalizePackages(load ? await load() : null)
}
