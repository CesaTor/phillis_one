import { group, type LayoutNode, split } from '@/components/pane-shell/tree/model'

import { sidebarTopPane } from '.'

const SESSIONS = 'sessions'

// The proportions a hand-arranged sidebar settled on: the short bot list over the longer chat list.
const WEIGHTS = [0.77, 1.23]

/** A default layout whose sidebar column stacks the distribution's own pane (ReAgent: Bots) above
 *  Sessions, instead of upstream's tabs. Only default layouts: a persisted tree keeps whatever its
 *  user arranged, and upstream (no top pane) gets `tree` back untouched. */
export function stackSidebar(tree: LayoutNode): LayoutNode {
  const top = sidebarTopPane()

  if (!top) {
    return tree
  }

  const walk = (node: LayoutNode): LayoutNode => {
    if (node.type === 'split') {
      return { ...node, children: node.children.map(walk) }
    }

    if (!node.panes.includes(SESSIONS)) {
      return node
    }

    // The top zone keeps the zone's id; layout code looks the sidebar up by it.
    return split(
      'column',
      [group([top], { id: node.id }), group(node.panes.filter(id => id !== top), { id: `${node.id}-sessions` })],
      WEIGHTS
    )
  }

  return walk(tree)
}
