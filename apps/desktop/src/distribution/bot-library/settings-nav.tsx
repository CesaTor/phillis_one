import type { OverlayNavGroup } from '@/app/overlays/overlay-split-layout'
import type { SettingsView } from '@/app/settings/types'
import { Package } from '@/lib/icons'

import { botLibraryPolicy } from '..'

import { copy } from './copy'

// The Bot Library's place in Settings. Upstream's nav is built from a fixed list, so the group is
// contributed here (nothing at all in upstream Hermes) and `distribution/index.ts` still decides, by
// its `settingsGroups` allowlist, whether this build shows it.

export const BOT_LIBRARY_VIEW = 'bot-library' satisfies SettingsView

/** The settings views this distribution adds. */
export function botLibrarySettingsViews(): SettingsView[] {
  return botLibraryPolicy() ? [BOT_LIBRARY_VIEW] : []
}

/** The nav group for the library page. */
export function botLibraryNavGroups(activeView: SettingsView, open: (view: SettingsView) => void): OverlayNavGroup[] {
  return botLibraryPolicy()
    ? [
        {
          active: activeView === BOT_LIBRARY_VIEW,
          icon: Package,
          id: BOT_LIBRARY_VIEW,
          label: copy.libraryTitle,
          onSelect: () => open(BOT_LIBRARY_VIEW)
        }
      ]
    : []
}
