import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const navigate = vi.fn()

vi.mock('@hermes/plugin-sdk', async () => {
  const { atom } = await import('nanostores')
  const { Button } = await import('@/components/ui/button')

  return {
    atom,
    Button,
    Codicon: () => null,
    host: { navigate },
    Tip: ({ children }: { children: React.ReactNode }) => children,
    useValue: (store: { get: () => unknown }) => store.get()
  }
})

afterEach(() => {
  cleanup()
  navigate.mockReset()
  vi.resetModules()
})

describe('the Bots pane library button', () => {
  it('opens the library page when the build has a library', async () => {
    const { atom } = await import('nanostores')
    const { setPluginCtx } = await import('./shared')
    const { BotLibraryButton } = await import('./library-button')

    setPluginCtx({ botLibrary: { hiddenBots: atom(new Set<string>()), label: 'Bot Library', path: '/settings?tab=bot-library' } } as never)
    render(<BotLibraryButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Bot Library' }))

    expect(navigate).toHaveBeenCalledWith('/settings?tab=bot-library')
  })

  it('is absent without one (upstream Hermes)', async () => {
    const { setPluginCtx } = await import('./shared')
    const { BotLibraryButton } = await import('./library-button')

    setPluginCtx({} as never)

    expect(render(<BotLibraryButton />).container.firstChild).toBeNull()
  })
})
