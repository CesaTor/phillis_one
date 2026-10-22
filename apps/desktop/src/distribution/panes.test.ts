import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// ReAgent's sidebar is the Bots pane stacked ABOVE the Sessions pane (not tabbed with it). The
// contract: the default layouts come out stacked, and the Bots dock hint does not pull the pane
// back into a tab beside Sessions on the next boot.

const TREE_KEY = 'hermes.desktop.layoutTree.v2'
const BOTS = 'hermes-bots:pane'

const defaultTree = {
  type: 'split',
  id: 'root',
  orientation: 'row',
  weights: [1, 3],
  children: [
    { type: 'group', id: 'grp-sessions', panes: ['sessions'], active: 'sessions' },
    { type: 'group', id: 'grp-main', panes: ['workspace'], active: 'workspace' }
  ]
}

async function boot(persisted?: unknown) {
  if (persisted) {
    window.localStorage.setItem(TREE_KEY, JSON.stringify(persisted))
  }

  const tree = await import('@/components/pane-shell/tree/store')
  const model = await import('@/components/pane-shell/tree/model')
  const { registry } = await import('@/contrib/registry')
  const { stackSidebar } = await import('./panes')

  registry.registerMany([
    { id: 'workspace', area: 'panes', title: 'chat', data: { placement: 'main' }, render: () => null },
    { id: 'sessions', area: 'panes', title: 'sessions', data: { placement: 'left', hideOnly: true }, render: () => null }
  ])
  tree.declareDefaultTree(stackSidebar(defaultTree as never))
  tree.watchContributedPanes()
  // The Bots plugin registers after core, with its dock hint as plugin.tsx declares it.
  registry.register({
    id: BOTS,
    area: 'panes',
    title: 'Bots',
    data: { placement: 'left', hideOnly: true, dock: { pane: 'sessions', pos: 'center', enforce: true } },
    render: () => null
  })

  const groupOf = (pane: string) => model.findGroupOfPane(tree.$layoutTree.get()!, pane)!

  return { groupOf, model, tree }
}

describe('Sidebar layout policy', () => {
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

  it('upstream: Sessions alone in its zone, Bots tabbed in beside it', async () => {
    const { groupOf } = await boot()

    expect(groupOf('sessions').panes).toEqual(['sessions', BOTS])
    expect(groupOf(BOTS).id).toBe(groupOf('sessions').id)
  })

  it('ReAgent: the default layout stacks Bots over Sessions in one column', async () => {
    vi.stubEnv('HERMES_DISTRIBUTION', 'reagent')

    const { groupOf, model, tree } = await boot()

    expect(groupOf(BOTS).panes).toEqual([BOTS])
    expect(groupOf('sessions').panes).toEqual(['sessions'])
    expect(groupOf(BOTS).id).not.toBe(groupOf('sessions').id)
    expect(model.findParentSplit(tree.$layoutTree.get()!, groupOf(BOTS).id)).toMatchObject({
      orientation: 'column',
      children: [{ id: groupOf(BOTS).id }, { id: groupOf('sessions').id }]
    })
    expect(tree.isPaneVisible(BOTS)).toBe(true)
    expect(tree.isPaneVisible('sessions')).toBe(true)
  })

  it('ReAgent: a boot does not re-stack Bots into the Sessions tab strip', async () => {
    vi.stubEnv('HERMES_DISTRIBUTION', 'reagent')

    const stacked = {
      type: 'split',
      id: 'root',
      orientation: 'row',
      weights: [1, 3],
      children: [
        {
          type: 'split',
          id: 's-col',
          orientation: 'column',
          weights: [1, 1],
          children: [
            { type: 'group', id: 'grp-sessions', panes: [BOTS], active: BOTS },
            { type: 'group', id: 'g-sessions', panes: ['sessions'], active: 'sessions' }
          ]
        },
        { type: 'group', id: 'grp-main', panes: ['workspace'], active: 'workspace' }
      ]
    }

    const { groupOf } = await boot(stacked)

    expect(groupOf(BOTS).panes).toEqual([BOTS])
    expect(groupOf('sessions').panes).toEqual(['sessions'])
  })

  it('upstream: a boot still re-homes a Bots pane dragged out of the Sessions zone', async () => {
    const dragged = {
      type: 'split',
      id: 'root',
      orientation: 'row',
      weights: [1, 1, 3],
      children: [
        { type: 'group', id: 'grp-sessions', panes: ['sessions'], active: 'sessions' },
        { type: 'group', id: 'g-bots', panes: [BOTS], active: BOTS },
        { type: 'group', id: 'grp-main', panes: ['workspace'], active: 'workspace' }
      ]
    }

    const { groupOf } = await boot(dragged)

    expect(groupOf(BOTS).id).toBe(groupOf('sessions').id)
  })
})
