/**
 * The Scheduled jobs header names the default bot with the host's primary handle: a host
 * that names one (`ctx.defaultBotHandle`, ReAgent's `requrv`) never shows upstream's @hermes,
 * and hides the handle when it only repeats the bot's name ("ReQurv" / @requrv).
 */

import type * as HermesSdk from '@hermes/plugin-sdk'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import type { atom } from 'nanostores'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { translateBots } from './i18n-test-helper'
import type { RosterRow, RoutineJob } from './types'

const { request } = vi.hoisted(() => ({ request: vi.fn() }))

vi.mock('@hermes/plugin-sdk', async importOriginal => {
  const sdk = await importOriginal<typeof HermesSdk>()
  const { atom: nanoAtom } = await import('nanostores')

  return {
    ...sdk,
    host: { ...sdk.host, request, state: { ...sdk.host.state, focusedSessionOwner: nanoAtom(null) } },
    usePluginI18n: () => translateBots
  }
})

const { host } = await import('@hermes/plugin-sdk')
const { $lastRoster } = await import('./data')
const { $selectedBot } = await import('./bot-state')
const { setPluginCtx } = await import('./shared')
const { RoutinesPane } = await import('./cron')

const $focused = host.state.focusedSessionOwner as unknown as ReturnType<typeof atom>
const job: RoutineJob = { enabled: true, job_id: 'j-1', name: 'Report', schedule: 'every 1h', state: 'scheduled' }

async function header(defaultBotHandle: string | undefined, row: RosterRow) {
  setPluginCtx((defaultBotHandle ? { defaultBotHandle } : {}) as never)
  $lastRoster.set([row])
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RoutinesPane />
    </QueryClientProvider>
  )
  await screen.findByText('Report')
}

beforeEach(() => {
  request.mockResolvedValue({ jobs: [job], scoped: 'default' })
  $selectedBot.set('default')
  $focused.set({ connectionId: 'local', profile: 'default' })
})

afterEach(() => {
  cleanup()
  setPluginCtx(null)
})

describe('a host that names the primary handle (ReAgent: requrv)', () => {
  it('reads ReQurv with no handle beside it', async () => {
    await header('requrv', { connectionId: 'local', display_name: 'ReQurv', name: 'default' })

    expect(screen.getByText('ReQurv')).toBeTruthy()
    expect(screen.queryByText(/@hermes/)).toBeNull()
    expect(screen.queryByText(/@requrv/)).toBeNull()
  })

  it('shows @requrv beside a renamed default', async () => {
    await header('requrv', { connectionId: 'local', display_name: 'Maia', name: 'default' })

    expect(screen.getByText('@requrv')).toBeTruthy()
    expect(screen.queryByText(/@hermes/)).toBeNull()
  })
})

describe('upstream Hermes (no handle named)', () => {
  it('shows @hermes beside a renamed default', async () => {
    await header(undefined, { connectionId: 'local', display_name: 'ReQurv', name: 'default' })

    expect(screen.getByText('ReQurv')).toBeTruthy()
    expect(screen.getByText('@hermes')).toBeTruthy()
  })
})
