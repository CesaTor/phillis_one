import { defaultBotHandle } from '.'

// The backend's `complete.path` lists the `default` profile twice: by folder id (`@default`) and
// by upstream's primary alias (`@hermes`, tui_gateway/methods_complete.py `_profile_mention_items`).
// The backend has no distribution concept, so a distribution that renames the handle folds both
// rows into one under its own. Both old forms still route (the Bots plugin keeps them as aliases).
const BACKEND_PRIMARY_ROWS = new Set(['@default', '@hermes'])

interface AtCompletionEntry {
  display?: unknown
  text: string
}

/** The gateway's `@` completion rows, with the primary bot under this distribution's handle. */
export function distributionAtCompletions<E extends AtCompletionEntry>(entries: E[]): E[] {
  const handle = defaultBotHandle()

  if (handle === 'hermes') {
    return entries
  }

  const primary = { display: `@${handle}`, text: `@${handle}` }
  let offered = false

  return entries.flatMap(entry => {
    if (!BACKEND_PRIMARY_ROWS.has(entry.text)) {
      return [entry]
    }

    if (offered) {
      return []
    }

    offered = true

    return [{ ...entry, ...primary }]
  })
}
