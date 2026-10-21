import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// ReAgent drops the core Sessions pane but keeps its tree slot as the Bots pane's dock anchor.
// The contract: Bots lands in the sidebar zone AND is that zone's active pane, so pane visibility
// (what the Bots plugin keys its bot chat and Routines pane on) agrees with what the user sees.

const TREE_KEY = 'hermes.desktop.layoutTree.v2'
const BOTS = 'hermes-bots:pane'

const presetTree = {
  type: 'split',
  id: 'root',
  orientation: 'row',
  weights: [1, 3],
  children: [
    { type: 'group', id: 'g-sessions', panes: ['sessions'], active: 'sessions' },
    { type: 'group', id: 'g-main', panes: ['workspace'], active: 'workspace' }
  ]
}

async function boot() {
  window.localStorage.setItem(TREE_KEY, JSON.stringify(presetTree))

  const tree = await import('@/components/pane-shell/tree/store')
  const model = await import('@/components/pane-shell/tree/model')
  const { registry } = await import('@/contrib/registry')
  const { sessionsPaneEnabled } = await import('./panes')

  // The core registrations as controller.tsx makes them.
  registry.registerMany([
    { id: 'workspace', area: 'panes', title: 'chat', data: { placement: 'main' }, render: () => null },
    {
      id: 'sessions',
      area: 'panes',
      enabled: sessionsPaneEnabled(),
      title: 'sessions',
      data: { placement: 'left', hideOnly: true },
      render: () => null
    }
  ])
  tree.watchContributedPanes()
  // The Bots plugin registers after core.
  registry.register({
    id: BOTS,
    area: 'panes',
    title: 'Bots',
    data: { placement: 'left', hideOnly: true, dock: { pane: 'sessions', pos: 'center', enforce: true } },
    render: () => null
  })

  const sidebar = () => model.findGroupOfPane(tree.$layoutTree.get()!, BOTS)!

  return { registry, sidebar, tree }
}

describe('Sessions pane policy', () => {
  beforeAll(async () => {
    await import('@/components/pane-shell/tree/store')
    vi.resetModules()
  })

  beforeEach(() => {
    window.localStorage.clear()
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('upstream: SESSIONS | BOTS, sessions active', async () => {
    const { registry, sidebar, tree } = await boot()

    expect(sidebar().panes).toEqual(['sessions', BOTS])
    expect(sidebar().active).toBe('sessions')
    expect(registry.getArea('panes').some(pane => pane.id === 'sessions')).toBe(true)
    expect(tree.isPaneVisible(BOTS)).toBe(false)
  })

  it('ReAgent: Bots docks into the sessions slot and is the active, visible pane', async () => {
    vi.stubEnv('HERMES_DISTRIBUTION', 'reagent')

    const { registry, sidebar, tree } = await boot()

    expect(sidebar().panes).toEqual(['sessions', BOTS])
    expect(sidebar().active).toBe(BOTS)
    expect(tree.isPaneVisible(BOTS)).toBe(true)
    // No tab, ⌘K toggle or zone-menu row: those all read the registered panes.
    expect(registry.getArea('panes').some(pane => pane.id === 'sessions')).toBe(false)
    expect(tree.hideOnlyZoneTabs(sidebar().id).map(tab => tab.id)).toEqual([BOTS])
  })

  it('ReAgent: a reveal of the sessions slot (⌘B, focus_pane) leaves Bots in front', async () => {
    vi.stubEnv('HERMES_DISTRIBUTION', 'reagent')

    const { sidebar, tree } = await boot()

    tree.revealTreePane('sessions')

    expect(sidebar().active).toBe(BOTS)
    expect(tree.isPaneVisible(BOTS)).toBe(true)
  })
})
