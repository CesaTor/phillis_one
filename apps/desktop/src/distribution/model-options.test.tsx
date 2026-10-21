import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { ModelOptionsContent } from '@/app/shell/model-edit-submenu'
import { DropdownMenu, DropdownMenuContent } from '@/components/ui/dropdown-menu'

// requrv-small-3.8 has no "off" level, so ReAgent drops the Thinking toggle; with no fast tier
// either, the OPTIONS section has no row and its heading must not render on its own.

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
  Element.prototype.hasPointerCapture = vi.fn(() => false)
  Element.prototype.releasePointerCapture = vi.fn()
})

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

function renderOptions() {
  return render(
    <DropdownMenu open>
      <DropdownMenuContent>
        <ModelOptionsContent
          defaultEffort="medium"
          effort="medium"
          fastControl={{ kind: 'none' }}
          isActive
          model="requrv-small-3.8"
          onSelectModel={vi.fn()}
          onSetOptions={vi.fn()}
          provider="requrv-hive"
          reasoning
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

describe('model options menu', () => {
  it('upstream: OPTIONS heads the Thinking toggle', () => {
    renderOptions()

    expect(screen.getByText('Options')).toBeTruthy()
    expect(screen.getByRole('switch')).toBeTruthy()
  })

  it('ReAgent: no Thinking toggle, so no empty OPTIONS heading; Effort stays', () => {
    vi.stubEnv('HERMES_DISTRIBUTION', 'reagent')
    renderOptions()

    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.queryByText('Options')).toBeNull()
    expect(screen.getByText('Effort')).toBeTruthy()
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(3)
  })
})
