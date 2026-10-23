import { renameProfile } from '@/hermes'
import { $profiles, refreshProfiles } from '@/store/profile'

import { startBotLibrarySync } from './bot-library/sync'
import { seedDefaultSoul } from './seed-soul'

import { defaultBotName, distribution } from '.'

// The distribution's name for the `default` profile's bot, written as that
// profile's display name — the field every surface (Bots roster, group chat,
// the CLI's profile list) already prefers over the upstream "Hermes" fallback,
// so no surface needs to learn about distributions. Only an UNNAMED default is
// seeded: once named (here or by the user — the backend refuses an empty
// name), the subscription never writes again.

let seeding = false

function seedDefaultBotName(): void {
  $profiles.subscribe(profiles => {
    const row = profiles.find(profile => profile.is_default)

    if (seeding || !row || row.display_name?.trim() || row.bot_title?.trim()) {
      return
    }

    seeding = true
    void renameProfile('default', defaultBotName())
      .then(() => refreshProfiles())
      .catch(error => console.warn('[distribution] could not name the default bot', error))
      .finally(() => {
        seeding = false
      })
  })
}

if (distribution() !== 'hermes') {
  seedDefaultBotName()
  seedDefaultSoul()
  startBotLibrarySync()
}
