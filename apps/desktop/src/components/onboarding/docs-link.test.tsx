import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DocsLink } from './flow'

afterEach(() => {
  cleanup()
  delete (window as { hermesDesktop?: unknown }).hermesDesktop
})

// The window-open policy denies every target=_blank request, so the anchor alone
// opens nothing in the packaged app: the click has to reach the audited IPC.
describe('DocsLink', () => {
  it('opens its URL through the desktop bridge instead of relying on target=_blank', () => {
    const openExternal = vi.fn()

    ;(window as { hermesDesktop?: unknown }).hermesDesktop = { openExternal }
    render(<DocsLink href="https://hive.requrv.ai/">Get a key</DocsLink>)

    expect(fireEvent.click(screen.getByRole('link', { name: /get a key/i }))).toBe(false)
    expect(openExternal).toHaveBeenCalledWith('https://hive.requrv.ai/')
  })
})
