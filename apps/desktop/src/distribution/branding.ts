import { distribution } from '.'

// Product names in user-facing copy. Applied to the RESOLVED translation
// catalog (every locale, every overlay) instead of editing the catalogs: they
// are the most-edited files upstream, so a rebrand written into them would
// conflict on every sync. Capitalized names only — lowercase `hermes` is a CLI
// command or a path (`hermes model`, `~/.hermes`) and must stay as written;
// `\b` keeps env names (`HERMES_HOME`) out of the uppercase rule.
const REAGENT_NAMES: readonly (readonly [RegExp, string])[] = [
  [/Nous ?Research/g, 'ReQurv Hive'],
  [/\bHermes (Desktop|Agent)\b/g, 'ReAgent'],
  // "Hermes' service" is the possessive of a name ending in s; ReAgent's isn't.
  [/\bHermes(['’])(?!s)/g, 'ReAgent$1s'],
  [/\bHermes\b/g, 'ReAgent'],
  [/\bHERMES( AGENT)?\b/g, 'REAGENT']
]

const rename = (text: string) => REAGENT_NAMES.reduce((out, [pattern, name]) => out.replace(pattern, name), text)

function brand(value: unknown): unknown {
  if (typeof value === 'string') {
    return rename(value)
  }

  if (typeof value === 'function') {
    const format = value as (...args: unknown[]) => unknown

    return (...args: unknown[]) => {
      const out = format(...args)

      return typeof out === 'string' ? rename(out) : out
    }
  }

  if (Array.isArray(value)) {
    return value.map(brand)
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, brand(entry)]))
  }

  return value
}

/** One literal (wordmarks, titles outside the catalog) with this distribution's product names. */
export function brandText(text: string): string {
  return distribution() === 'reagent' ? rename(text) : text
}

/** The catalog with this distribution's product names; upstream Hermes is untouched. */
export function brandTranslations<T>(catalog: T): T {
  return distribution() === 'reagent' ? (brand(catalog) as T) : catalog
}
