import { findGroupOfPane } from '@/components/pane-shell/tree/model'
import { $layoutTree, activateTreePane } from '@/components/pane-shell/tree/store'
import { registry } from '@/contrib/registry'

import { sessionsPaneAllowed } from '.'

// Without its Sessions pane the distribution still keeps the pane's SLOT: the layout presets name
// `sessions`, and that tree slot is what the Bots pane docks onto (`dock: { pane: 'sessions' }`),
// so Bots still lands in the sidebar zone. But the slot can be the zone's `active` pane — presets
// start there, a reveal (⌘B, the backend's focus_pane) fronts it — and while it is, the renderer
// shows Bots yet pane visibility (what `paneVisibility` tells the Bots plugin, which keys its bot
// chat and Routines pane on it) says nothing is on screen. So the zone fronts its first
// registered neighbour whenever it rests on the slot.

const SESSIONS = 'sessions'

function frontRegisteredNeighbour(): void {
  const tree = $layoutTree.get()
  const group = tree ? findGroupOfPane(tree, SESSIONS) : null

  if (group?.active !== SESSIONS) {
    return
  }

  const registered = new Set(registry.getArea('panes').map(pane => pane.id))
  const neighbour = group.panes.find(id => registered.has(id))

  if (neighbour) {
    activateTreePane(group.id, neighbour)
  }
}

/** Whether the core Sessions pane registers (`enabled`). Where it doesn't, its zone is kept
 *  fronting the pane docked beside it — the Bots pane — from boot on. */
export function sessionsPaneEnabled(): boolean {
  if (sessionsPaneAllowed()) {
    return true
  }

  $layoutTree.subscribe(frontRegisteredNeighbour)
  registry.subscribe(frontRegisteredNeighbour)

  return false
}
