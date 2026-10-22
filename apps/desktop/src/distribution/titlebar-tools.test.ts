// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// A titlebar tool ReAgent hides takes its keyboard doors with it: the chord stops dispatching and the
// keybinds panel no longer lists it. Built-in (`view.toggleHud`), contributed (`layout.editMode`,
// registered the way controller.tsx does) and read-only (`hud.snapToPointer`) actions alike.

const HIDDEN = ['view.toggleHud', 'layout.editMode', 'hud.snapToPointer']

async function boot() {
  const { registry } = await import('@/contrib/registry')
  const actions = await import('@/lib/keybinds/actions')
  const { $comboIndex } = await import('@/store/keybinds')

  registry.registerMany([
    {
      id: 'layout.editMode',
      area: actions.KEYBINDS_AREA,
      data: { id: 'layout.editMode', label: 'Toggle layout edit mode', defaults: ['mod+shift+\\'], run: () => {} }
    }
  ])

  const dispatched = new Set([...$comboIndex.get().values()].flat())
  const listed = new Set([...actions.allKeybindActions(), ...actions.KEYBIND_READONLY].map(action => action.id))

  return { dispatched, listed }
}

beforeEach(() => {
  vi.resetModules()
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('keybinds of hidden titlebar tools', () => {
  it('upstream Hermes binds and lists the HUD and layout-editor actions', async () => {
    const { dispatched, listed } = await boot()

    expect(HIDDEN.every(id => listed.has(id))).toBe(true)
    expect(dispatched.has('view.toggleHud')).toBe(true)
    expect(dispatched.has('layout.editMode')).toBe(true)
  })

  it('ReAgent neither binds nor lists them, and keeps the tools it shows', async () => {
    vi.stubEnv('HERMES_DISTRIBUTION', 'reagent')

    const { dispatched, listed } = await boot()

    expect(HIDDEN.filter(id => listed.has(id) || dispatched.has(id))).toEqual([])
    expect(dispatched.has('view.flipPanes')).toBe(true)
    expect(dispatched.has('view.toggleRightSidebar')).toBe(true)
    expect(dispatched.has('nav.settings')).toBe(true)
  })
})
