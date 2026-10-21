/**
 * The composer's @-mention completion and mention middleware, driven through the real
 * `plugin.register()`, for a host that names the primary handle (`ctx.defaultBotHandle`,
 * ReAgent's `requrv`) and for upstream (no handle named: @hermes). The middleware's
 * `message_agent` target stays the backend alias either way: `tools/bot_mode_dm.py` resolves
 * `hermes` to `default` whatever the bot is named.
 */

import { beforeAll, describe, expect, it, vi } from 'vitest'

interface Contribution {
  data: {
    handler?: (draft: { text: string }) => Promise<{ text: string }>
    provide?: (query: string) => Array<{ handles?: string[]; insert: string }>
  }
  id: string
}

const { cache } = vi.hoisted(() => ({ cache: new Map<string, { key: unknown[]; value: unknown }>() }))

vi.mock('@hermes/plugin-sdk', async () => {
  const { atom } = await import('nanostores')

  const stub: unknown = new Proxy(function stubbed() {}, {
    apply: () => stub,
    get: (_target, key) => (key === 'then' ? undefined : stub)
  })

  const store = <T>(value: T) => ({ get: () => value, listen: () => () => undefined })

  const known: Record<string, unknown> = {
    atom,
    COMPOSER_AREAS: { atCompletions: 'composer.atCompletions', middleware: 'composer.middleware' },
    host: {
      notify: vi.fn(),
      request: vi.fn(async () => ({})),
      requestProfile: vi.fn(async () => ({})),
      agents: vi.fn(async () => ({ agents: [], sources: [] })),
      state: {
        connectionId: store('local'),
        focusedSessionProfile: store('researcher'),
        focusedStoredSessionId: store(null),
        gateway: store(null),
        profile: store('researcher')
      }
    },
    PALETTE_AREA: 'palette',
    queryClient: {
      getQueriesData: ({ queryKey }: { queryKey: unknown[] }) =>
        [...cache.values()]
          .filter(entry => queryKey.every((part, index) => entry.key[index] === part))
          .map(entry => [entry.key, entry.value]),
      getQueryData: (key: unknown[]) => cache.get(JSON.stringify(key))?.value,
      invalidateQueries: () => undefined,
      setQueryData: (key: unknown[], value: unknown) => cache.set(JSON.stringify(key), { key, value })
    }
  }

  return new Proxy(known, {
    get: (target, key) =>
      typeof key === 'symbol' || key in target ? target[key as string] : key === 'then' ? undefined : stub,
    has: () => true
  })
})

/** Default bot (named ReQurv, as ReAgent seeds it) seen from another bot's chat. */
const PROFILES = [
  { connectionId: 'local', connectionKind: 'local', display_name: 'ReQurv', name: 'default' },
  { connectionId: 'local', connectionKind: 'local', name: 'researcher' }
]

async function contributions(defaultBotHandle?: string, profiles: Array<Record<string, unknown>> = PROFILES) {
  vi.resetModules()
  cache.clear()

  const key = ['hermes-bots', 'roster', 'local']
  cache.set(JSON.stringify(key), { key, value: { profiles } })

  const plugin = (await import('./plugin')).default
  const registered: Contribution[] = []

  try {
    plugin.register({
      ...(defaultBotHandle ? { defaultBotHandle } : {}),
      i18n: { register: () => () => undefined },
      onDispose: () => undefined,
      register: (contribution: Contribution) => registered.push(contribution),
      storage: { get: async () => undefined, remove: async () => undefined, set: async () => undefined }
    } as never)
  } catch {
    // Registration walks UI surfaces the stub does not model; the composer contributions come first.
  }

  const completions = registered.find(entry => entry.id === 'mention-completions')!.data.provide!
  const middleware = registered.find(entry => entry.id === 'mention-middleware')!.data.handler!

  return { middleware, provide: (query: string) => completions(query).map(item => item.insert) }
}

beforeAll(async () => {
  await import('./plugin')
}, 120_000)

describe('a host that names the primary handle (ReAgent: requrv)', () => {
  it('completes the primary as @requrv, never @hermes, before and after it is named', async () => {
    const unnamed = PROFILES.map(({ display_name: _named, ...row }) => row)

    for (const profiles of [unnamed, PROFILES]) {
      const { provide } = await contributions('requrv', profiles)

      expect(provide('')).toContain('@requrv')
      expect(provide('req')).toEqual(['@requrv'])
      expect(provide('').join(' ')).not.toMatch(/@hermes|@default\b/)
    }
  })

  it('routes @requrv to the default profile, and the old @hermes still does', async () => {
    const { middleware } = await contributions('requrv')

    for (const tag of ['@requrv', '@hermes']) {
      const { text } = await middleware({ text: `${tag} summarize the plan` })

      expect(text).toMatch(/@requrv = agent profile "default" \(message_agent target: "hermes"\)/)
    }
  })
})

describe('upstream Hermes (no handle named)', () => {
  it('routes @hermes to the default profile with no extra target note', async () => {
    const { middleware } = await contributions()
    const { text } = await middleware({ text: '@hermes summarize the plan' })

    expect(text).toMatch(/@hermes = agent profile "default"\. /)
    expect(text).not.toMatch(/message_agent target: "hermes"/)
  })
})
