/** A locked bot in the Bots pane: a lock beside its name, and the row menu's Duplicate becomes the personal copy. */

import type * as HermesSdk from '@hermes/plugin-sdk'
import { fireEvent, render, screen } from '@testing-library/react'
import { atom } from 'nanostores'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { BotRow } from './bot-row'
import { translateBots } from './i18n-test-helper'
import { setPluginCtx } from './shared'

const { requestDuplicate } = vi.hoisted(() => ({ requestDuplicate: vi.fn() }))

vi.mock('@hermes/plugin-sdk', async importOriginal => {
  const sdk = await importOriginal<typeof HermesSdk>()

  return { ...sdk, host: { ...sdk.host, warmProfile: vi.fn() }, usePluginI18n: () => translateBots }
})

vi.mock('./canonical-chat', () => ({
  ensureBotMetadata: vi.fn(async () => ({})),
  notifyBotOpenFailure: vi.fn(),
  openBotCanonicalChat: vi.fn(),
  prepareBotSource: vi.fn(),
  PROFILE_SESSION_LIST_LIMIT: 200
}))

vi.mock('./roster-actions', () => ({ openRosterBot: vi.fn() }))

const noop = () => undefined

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
  setPluginCtx({
    botLibrary: {
      copy: { duplicateAction: 'Duplicate as personal bot', lockNotice: 'Managed by your department library', lockTooltip: () => 'tip' },
      hiddenBots: atom(new Set<string>()),
      requestDuplicate,
      useLocked: (profile: string) => (profile === 'sales' ? { managedConfig: [], version: '1.2' } : null)
    }
  } as never)
})

afterEach(() => vi.clearAllMocks())

function renderRow(name: string) {
  render(<BotRow bot={{ name }} onDelete={noop} onEdit={noop} onGroup={noop} onNewSection={noop} />)

  return screen.getByRole('button')
}

describe('a library bot row', () => {
  it('carries the lock badge', () => {
    renderRow('sales')
    expect(screen.getByLabelText('Managed by your department library')).toBeTruthy()
  })

  it('has no badge on an ordinary bot', () => {
    renderRow('mine')
    expect(screen.queryByLabelText('Managed by your department library')).toBeNull()
  })

  it('swaps Duplicate for the personal copy in the row menu', () => {
    fireEvent.contextMenu(renderRow('sales'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate as personal bot' }))

    expect(requestDuplicate).toHaveBeenCalledWith('sales', expect.any(Function))
  })
})
