/**
 * The primary (`default`) profile's @handle follows the host: upstream Hermes shows it as
 * @hermes, a host naming another handle (`ctx.defaultBotHandle`, ReAgent's `requrv`) shows,
 * completes and routes that one. The backend's `hermes` alias keeps routing to the primary
 * either way: agents stamp it from backend prompts, and older rooms and descriptors carry it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { $groupChats } from './group-chat'
import { durableGroupChatMembers, groupMemberKey } from './group-membership'
import { classifyGroupMention } from './group-mention-text'
import { parseGroupChatMentions, resolveGroupResponders } from './group-rounds'
import { backendBotHandle } from './primary-handle'
import { setPluginCtx } from './shared'
import type { GroupMember, GroupMessage, RosterRow } from './types'

vi.mock('@hermes/plugin-sdk', async () => {
  const { atom } = await import('nanostores')

  return {
    atom,
    host: { request: vi.fn(), state: { connectionId: { get: () => 'local' }, profile: { get: () => 'default' } } },
    queryClient: { invalidateQueries: vi.fn() },
    useQuery: vi.fn(),
    useValue: vi.fn()
  }
})

const { botHandle, botMentionTag, filterBots, resolveRosterMentions } = await import('./data')

const host = (defaultBotHandle?: string) => setPluginCtx((defaultBotHandle ? { defaultBotHandle } : {}) as never)

const ROSTER: RosterRow[] = [
  { connectionId: 'local', display_name: 'ReQurv', name: 'default', sourceScoped: true },
  { connectionId: 'local', name: 'researcher', sourceScoped: true }
]

const ROOM: GroupMember[] = [
  { connectionId: 'local', name: 'default', sourceScoped: true },
  { connectionId: 'local', name: 'researcher', sourceScoped: true }
]

const primaryKey = groupMemberKey(ROOM[0])

function routes(text: string, members: GroupMember[] = ROOM): string[] {
  return [...parseGroupChatMentions(text, members).mentioned]
}

beforeEach(() => $groupChats.set({}))
afterEach(() => setPluginCtx(null))

describe('a host that names the primary handle (ReAgent: requrv)', () => {
  beforeEach(() => host('requrv'))

  it('shows and tags the primary as @requrv, renamed or not', () => {
    expect(botHandle('default')).toBe('requrv')
    expect(botHandle('default', { handle: 'hermes', name: 'default' })).toBe('requrv')
    expect(botMentionTag({ name: 'default' })).toBe('requrv')
    expect(botMentionTag(ROSTER[0])).toBe('requrv')
    expect(filterBots(ROSTER, {}, '@requrv').map(bot => bot.name)).toEqual(['default'])
  })

  it('routes @requrv and the silent @hermes alias to the primary in a room, from fresh or stored members', () => {
    // Descriptors persisted before the rename carry the backend alias as their handle.
    const legacy = ROOM.map(member => (member.name === 'default' ? { ...member, handle: 'hermes' } : member))

    for (const members of [ROOM, durableGroupChatMembers(ROSTER), legacy]) {
      expect(routes('@requrv take this', members)).toEqual([primaryKey])
      expect(routes('@hermes take this', members)).toEqual([primaryKey])
    }

    expect(durableGroupChatMembers(ROSTER)[0].handle).toBe('requrv')
    expect(classifyGroupMention('requrv', ROOM)).toBe('agent')

    const log: GroupMessage[] = [
      { at: 1, from: { kind: 'user', name: 'You' }, id: 'u', text: '@requrv begin', thread: 't' }
    ]

    expect(resolveGroupResponders(log, ROOM).map(member => member.name)).toEqual(['default'])
  })

  it('resolves @requrv and @hermes against the roster from another bot, never a bot titled after either', () => {
    const roster: RosterRow[] = [
      ...ROSTER,
      { connectionId: 'local', name: 'impostor', sourceScoped: true, title: 'ReQurv' },
      { connectionId: 'local', name: 'mimic', sourceScoped: true, title: 'Hermes' }
    ]

    for (const tag of ['@requrv', '@hermes']) {
      const active = { connectionId: 'local', name: 'researcher' }
      expect(resolveRosterMentions(`${tag} summarize`, roster, active).map(bot => bot.name)).toEqual(['default'])
    }
  })

  it('keeps a device-qualified default off the primary handle', () => {
    const remote: GroupMember = {
      connectionId: 'vera',
      handle: 'default-vera',
      name: 'default',
      remoteSource: true,
      sourceScoped: true
    }

    expect(botHandle(remote.name, remote)).toBe('default-vera')
    expect(routes('@requrv go', [remote, ...ROOM])).toEqual([primaryKey])
    expect(routes('@default-vera go', [remote, ...ROOM])).toEqual([groupMemberKey(remote)])
  })

  it('hands the backend the alias its resolvers accept', () => {
    expect(backendBotHandle('default')).toBe('hermes')
    expect(backendBotHandle('default', { handle: 'requrv', name: 'default' })).toBe('hermes')
    expect(backendBotHandle('default', { handle: 'default-vera', name: 'default' })).toBe('default-vera')
    expect(backendBotHandle('researcher')).toBe('researcher')
  })
})

describe('upstream Hermes (no handle named)', () => {
  beforeEach(() => host())

  it('keeps the primary @hermes everywhere, and @requrv is only a friendly-name tag', () => {
    expect(botHandle('default')).toBe('hermes')
    expect(botMentionTag({ name: 'default' })).toBe('hermes')
    expect(botMentionTag(ROSTER[0])).toBe('requrv')
    expect(durableGroupChatMembers(ROSTER)[0].handle).toBe('hermes')
    expect(routes('@hermes take this')).toEqual([primaryKey])
    expect(routes('@requrv take this')).toEqual([])
    expect(backendBotHandle('default')).toBe('hermes')
  })
})
