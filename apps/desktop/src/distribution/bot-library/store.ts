import { computed } from 'nanostores'

import { Codecs, persistentAtom } from '@/lib/persisted'

// What this install knows about the organization's bot library. Install-global on purpose (one
// person, one organization per ReAgent install), not profile-scoped: it decides which bots the
// Bots pane lists, and the bots are the profiles.

/** The organization's synced folder (Drive/Nextcloud), chosen once with the native folder picker. */
export const $libraryRoot = persistentAtom<null | string>('hermes.desktop.reagent.library-root', null, Codecs.nullableText)

/** The department whose library this install follows; null until the first-run pick. */
export const $department = persistentAtom<null | string>('hermes.desktop.reagent.department', null, Codecs.nullableText)

/** The person went on without a library on first run (no folder to point at). Settings still offers it. */
export const $libraryOnboardingSkipped = persistentAtom('hermes.desktop.reagent.library-skipped', false, Codecs.bool)

/** Profile name → department it was installed for through the library. A bot with no entry (the
 *  default ReQurv bot, one the user made, a base-catalog bot) belongs to every department. */
export const $botDepartment = persistentAtom<Record<string, string>>(
  'hermes.desktop.reagent.bot-department',
  {},
  Codecs.stringRecord
)

export function setLibraryRoot(root: null | string): void {
  $libraryRoot.set(root)
}

export function setDepartment(department: null | string): void {
  $department.set(department)
}

export function skipLibraryOnboarding(): void {
  $libraryOnboardingSkipped.set(true)
}

export function recordBotDepartment(profile: string, department: string): void {
  $botDepartment.set({ ...$botDepartment.get(), [profile]: department })
}

const EMPTY: ReadonlySet<string> = new Set()

/** Profiles installed for a department other than the current one: hidden from the Bots pane, never
 *  deleted (their chats and sessions stay where they are). Nothing is hidden before a department is set. */
export const $departmentHiddenBots = computed(
  [$department, $botDepartment],
  (department, owners): ReadonlySet<string> =>
    department
      ? new Set(Object.entries(owners).flatMap(([profile, owner]) => (owner === department ? [] : [profile])))
      : EMPTY
)
