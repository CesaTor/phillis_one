/**
 * A bot installed from the organization's library is locked: the library overwrites its SOUL, shipped
 * skills, shipped jobs and managed config on every update. The editor shows those read-only, hides the
 * jobs' delete, and offers a personal copy; skill on/off and everything the library does not own stay
 * editable, and an ordinary bot is untouched.
 */

import type * as HermesSdk from '@hermes/plugin-sdk'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { atom } from 'nanostores'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { translateBots } from './i18n-test-helper'
import type { CapabilityEntry } from './profile-config'
import type * as Routing from './routing'
import { setPluginCtx } from './shared'
import type { RosterRow, RoutineJob } from './types'

const { invalidateQueries, openRosterBot, requestDuplicate } = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
  openRosterBot: vi.fn(),
  requestDuplicate: vi.fn()
}))

vi.mock('@hermes/plugin-sdk', async importOriginal => {
  const sdk = await importOriginal<typeof HermesSdk>()

  return {
    ...sdk,
    ConnectorsTab: () => <div data-testid="connectors" />,
    CapabilitiesView: undefined,
    host: { ...sdk.host, getGateway: () => 'gateway', request: vi.fn(async () => ({})) },
    queryClient: { invalidateQueries },
    ToolsetConfigPanel: undefined,
    usePluginI18n: () => translateBots
  }
})

vi.mock('./model-picker', () => ({ ModelPicker: () => <button type="button">Pick model</button> }))
vi.mock('./skills-hub', () => ({ HubSkillsSection: () => <div>Skills Hub</div> }))
vi.mock('./roster-actions', () => ({ openRosterBot }))
vi.mock('./routing', async importOriginal => ({
  ...(await importOriginal<typeof Routing>()),
  requestForBot: vi.fn(async () => ({}))
}))

const { AdvancedProfileConfig } = await import('./profile-config')
const { RoutineRow } = await import('./cron')
const { LibraryLockNotice, useBotLibraryLock } = await import('./library-lock')

const NOTICE = 'Managed by your department library — duplicate to customise'

function install(managedConfig: string[] = ['mcp_servers']) {
  setPluginCtx({
    botLibrary: {
      copy: { duplicateAction: 'Duplicate as personal bot', lockNotice: NOTICE, lockTooltip: (v: null | string) => `lock ${v}` },
      hiddenBots: atom(new Set<string>()),
      isManagedConfigKey: (lock: { managedConfig: string[] }, key: string) => lock.managedConfig.includes(key),
      label: 'Bot Library',
      path: '/settings?tab=bot-library',
      requestDuplicate,
      useLocked: (profile: string) => (profile === 'sales' ? { managedConfig, version: '1.2' } : null)
    }
  } as never)
}

const skills: CapabilityEntry[] = [{ enabled: true, name: 'crm-lookup' }]

const state = {
  dirtyMcp: false,
  dirtyModel: false,
  dirtySkills: false,
  dirtySoul: false,
  dirtyToolsets: false,
  loaded: true,
  mcp: [{ enabled: true, name: 'crm-server' }] as CapabilityEntry[],
  model: '',
  provider: '',
  skills,
  soul: 'You are the sales assistant.',
  toolsets: [] as CapabilityEntry[]
}

const sales: RosterRow = { name: 'sales' }
const mine: RosterRow = { name: 'mine' }

function editor(bot: RosterRow, setState = vi.fn()) {
  const { container } = render(<AdvancedProfileConfig bot={bot} setState={setState} state={state} />)

  return { setState, soul: () => container.querySelector('textarea') }
}

beforeEach(() => install())

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  setPluginCtx(null)
})

describe('the advanced editor of a library bot', () => {
  it('shows SOUL and managed MCP servers read-only, with no skill installs', () => {
    const { soul } = editor(sales)

    expect(soul()?.readOnly).toBe(true)
    expect(screen.getByText('crm-server')).toBeTruthy()
    expect(screen.queryByTestId('connectors')).toBeNull()
    expect(screen.queryByText('Skills Hub')).toBeNull()
  })

  it('keeps skill enable/disable working', () => {
    const { setState } = editor(sales)

    fireEvent.click(screen.getByRole('checkbox', { name: 'crm-lookup' }))

    expect(setState).toHaveBeenCalledTimes(1)
    const next = setState.mock.calls[0][0](state)

    expect(next.dirtySkills).toBe(true)
    expect(next.skills[0].enabled).toBe(false)
  })

  it('locks the model picker only when the library manages the model', () => {
    editor(sales)
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Pick model' }).matches(':disabled')).toBe(false)
    cleanup()

    install(['mcp_servers', 'model'])
    editor(sales)
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Pick model' }).matches(':disabled')).toBe(true)
  })

  it('leaves an ordinary bot fully editable', () => {
    const { soul } = editor(mine)

    expect(soul()?.readOnly).toBe(false)
    expect(screen.getByTestId('connectors')).toBeTruthy()
    expect(screen.getByText('Skills Hub')).toBeTruthy()
  })
})

describe('the lock notice', () => {
  function Notice({ bot }: { bot: RosterRow }): ReactNode {
    return <LibraryLockNotice lock={useBotLibraryLock(bot)} />
  }

  it('offers the personal copy and opens it when it exists', async () => {
    render(<Notice bot={sales} />)

    expect(screen.getByText(NOTICE)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate as personal bot' }))

    expect(requestDuplicate).toHaveBeenCalledWith('sales', expect.any(Function))
    requestDuplicate.mock.calls[0][1]('sales-copy')

    expect(invalidateQueries).toHaveBeenCalled()
    await waitFor(() => expect(openRosterBot).toHaveBeenCalledWith({ name: 'sales-copy' }))
  })

  it('is absent for an ordinary bot and for a same-named bot on another gateway', () => {
    expect(render(<Notice bot={mine} />).container.firstChild).toBeNull()
    expect(render(<Notice bot={{ name: 'sales', remoteSource: true }} />).container.firstChild).toBeNull()
  })
})

describe('library jobs', () => {
  const job: RoutineJob = { enabled: true, job_id: 'job-1', name: '[bot:sales] Digest', schedule: 'every 1440m' }

  it('hides delete on a locked bot and keeps it on an ordinary one', () => {
    render(<RoutineRow job={job} owner={sales} />)
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
    expect(screen.getByRole('switch')).toBeTruthy()
    cleanup()

    render(<RoutineRow job={job} owner={mine} />)
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy()
  })
})
