import type { ReactElement } from 'react'

import type { PanelMenuItem } from '@/app/overlays/panel'
import { Button } from '@/components/ui/button'
import { Lock } from '@/lib/icons'
import type { ProfileInfo } from '@/types/hermes'

import { copy } from './copy'
import { requestDuplicate } from './duplicate'
import { libraryLockOf } from './locked'

// The app's own profile surfaces (Manage Profiles) show the same lock the Bots plugin does: one notice,
// one way out. The Bots plugin renders its own from the same words (`ctx.botLibrary.copy`).

/** The notice with the way out; nothing for an ordinary bot. */
export function LibraryLockNotice({
  onDuplicated,
  profile
}: {
  onDuplicated?: (copy: string) => void
  profile: ProfileInfo
}): null | ReactElement {
  if (!libraryLockOf(profile)) {
    return null
  }

  return (
    <div className="grid justify-items-start gap-2 rounded-md border border-border px-3 py-2 text-xs text-muted-foreground">
      <span className="flex min-w-0 items-start gap-1.5">
        <Lock className="mt-0.5 size-3.5 shrink-0" />
        {copy.lockNotice}
      </span>
      <Button onClick={() => requestDuplicate(profile.name, onDuplicated)} size="sm" variant="outline">
        {copy.duplicateAction}
      </Button>
    </div>
  )
}

/** The row-menu entry for a locked profile; empty for an ordinary one. */
export function libraryMenuItems(profile: ProfileInfo, onDuplicated?: (copy: string) => void): PanelMenuItem[] {
  return libraryLockOf(profile)
    ? [{ icon: 'copy', label: copy.duplicateAction, onSelect: () => requestDuplicate(profile.name, onDuplicated) }]
    : []
}
