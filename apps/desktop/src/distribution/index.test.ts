import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  appViewForPath,
  ARTIFACTS_ROUTE,
  CRON_ROUTE,
  MESSAGING_ROUTE,
  SETTINGS_ROUTE,
  STARMAP_ROUTE
} from '@/app/routes'
import { createPluginContext } from '@/contrib/plugin'
import type { PluginI18n, PluginLocaleBundles } from '@/i18n'

import { brandPluginI18n, brandText, brandTranslations } from './branding'

import {
  addProviderAllowed,
  chooseProviderLaterAllowed,
  distributionAsset,
  distributionKeyOptions,
  distributionLink,
  distributionLogo,
  filterModelOptions,
  filterPaletteGroups,
  filterSettingsNav,
  filterSettingsSearch,
  modelEffortAllowed,
  onboardingReasonAllowed,
  providerAllowed,
  remoteConnectionsAllowed,
  sessionsPaneAllowed,
  sharedMetricsAllowed
} from '.'

const catalog = {
  providers: [
    { slug: 'openrouter', name: 'OpenRouter' },
    { slug: 'requrv-hive', name: 'ReQurv Hive' },
    { slug: 'nous', name: 'Nous Portal' }
  ]
}

afterEach(() => {
  vi.unstubAllEnvs()
})

// A `ctx.i18n` stand-in that records what a plugin registered.
function recordingI18n() {
  const registered: PluginLocaleBundles[] = []

  const i18n = {
    register: (bundles: PluginLocaleBundles) => {
      registered.push(bundles)

      return () => undefined
    }
  } as unknown as PluginI18n

  return { i18n, registered }
}

const BOTS_BUNDLES: PluginLocaleBundles = {
  en: { roster: { unavailable: (reason: string) => `Roster unavailable: ${reason}. Update Hermes.` } }
}

const unavailable = (bundles: PluginLocaleBundles | undefined) =>
  (bundles?.en?.roster as { unavailable: (reason: string) => string }).unavailable('Hermes gateway is not connected')

describe('upstream Hermes (no distribution)', () => {
  it('keeps every route, provider and surface', () => {
    expect(appViewForPath(CRON_ROUTE)).toBe('cron')
    expect(appViewForPath(MESSAGING_ROUTE)).toBe('messaging')
    expect(filterModelOptions(catalog).providers).toHaveLength(3)
    expect(remoteConnectionsAllowed()).toBe(true)
    expect(distributionAsset('nous-girl.png')).toBe('nous-girl.png')
    expect(distributionLogo('dark')).toBeNull()
    expect(distributionLink('https://github.com/NousResearch/hermes-agent/releases')).toBe(
      'https://github.com/NousResearch/hermes-agent/releases'
    )
    expect(sharedMetricsAllowed()).toBe(true)
    expect(brandText('HERMES AGENT')).toBe('HERMES AGENT')
    expect(modelEffortAllowed('requrv-hive', 'requrv-small-3.8', 'high')).toBe(true)
  })

  it('keeps the Sessions tab, add-provider doors, onboarding reason and choose-later', () => {
    expect(sessionsPaneAllowed()).toBe(true)
    expect(addProviderAllowed()).toBe(true)
    expect(onboardingReasonAllowed()).toBe(true)
    expect(chooseProviderLaterAllowed()).toBe(true)
  })

  it("shows every plugin surface, the Bots pane's gateway-groups list included", () => {
    expect(createPluginContext('hermes-bots').surfaceAllowed?.('gateway-groups')).toBe(true)
  })

  it('keeps the gateway-not-connected error as upstream wrote it', async () => {
    vi.resetModules()

    const { GATEWAY_NOT_CONNECTED_MESSAGE } = await import('@/api/client')

    expect(GATEWAY_NOT_CONNECTED_MESSAGE).toBe('Hermes gateway is not connected')
  })

  it('hands plugins their own i18n door, bundles untouched', () => {
    const { i18n, registered } = recordingI18n()

    expect(brandPluginI18n(i18n)).toBe(i18n)
    brandPluginI18n(i18n).register(BOTS_BUNDLES)
    expect(registered).toEqual([BOTS_BUNDLES])
    expect(unavailable(registered[0])).toBe('Roster unavailable: Hermes gateway is not connected. Update Hermes.')
  })
})

describe('ReAgent', () => {
  const reagent = () => vi.stubEnv('HERMES_DISTRIBUTION', 'reagent')

  it('sends hidden pages to the chat and keeps settings and the memory starmap', () => {
    reagent()

    expect(appViewForPath(CRON_ROUTE)).toBe('chat')
    expect(appViewForPath(MESSAGING_ROUTE)).toBe('chat')
    expect(appViewForPath(ARTIFACTS_ROUTE)).toBe('chat')
    expect(appViewForPath(SETTINGS_ROUTE)).toBe('settings')
    expect(appViewForPath(STARMAP_ROUTE)).toBe('starmap')
  })

  it('offers ReQurv Hive as the only provider', () => {
    reagent()

    expect(filterModelOptions(catalog).providers.map(p => p.slug)).toEqual(['requrv-hive'])
    expect(providerAllowed('custom')).toBe(false)
    expect(distributionKeyOptions([{ docsUrl: '', envKey: 'OPENAI_API_KEY', id: 'openai', name: 'OpenAI' }])).toEqual([
      expect.objectContaining({ envKey: 'REQURV_HIVE_API_KEY', id: 'requrv-hive' })
    ])
  })

  it('offers requrv-small-3.8 only the efforts it accepts, and no thinking-off', () => {
    reagent()

    const offered = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'].filter(effort =>
      modelEffortAllowed('requrv-hive', 'requrv-small-3.8', effort)
    )

    expect(offered).toEqual(['low', 'medium', 'xhigh'])
    expect(modelEffortAllowed('requrv-hive', 'some-other-model', 'high')).toBe(true)
  })

  it('offers no door to another provider and no way past the Hive key', () => {
    reagent()

    expect(addProviderAllowed()).toBe(false)
    expect(chooseProviderLaterAllowed()).toBe(false)
    expect(onboardingReasonAllowed()).toBe(false)
  })

  it('makes Bots the whole sidebar: no Sessions pane', () => {
    reagent()

    expect(sessionsPaneAllowed()).toBe(false)
  })

  it("leaves the Bots pane's gateway-groups list out, and any plugin surface it never let in", () => {
    reagent()

    expect(createPluginContext('hermes-bots').surfaceAllowed?.('gateway-groups')).toBe(false)
    expect(createPluginContext('some-plugin').surfaceAllowed?.('some-future-surface')).toBe(false)
  })

  it('names itself in the gateway-not-connected error plugins show raw (Bots group list)', async () => {
    reagent()
    vi.resetModules()

    const { GATEWAY_NOT_CONNECTED_MESSAGE } = await import('@/api/client')

    expect(GATEWAY_NOT_CONNECTED_MESSAGE).toBe('ReAgent gateway is not connected')
  })

  it('brands plugin locale bundles, interpolated values included', () => {
    reagent()

    const { i18n, registered } = recordingI18n()

    brandPluginI18n(i18n).register(BOTS_BUNDLES)

    expect(unavailable(registered[0])).toBe('Roster unavailable: ReAgent gateway is not connected. Update ReAgent.')
  })

  it('is local-only and never offers Nous telemetry', () => {
    reagent()

    expect(remoteConnectionsAllowed()).toBe(false)
    expect(distributionAsset('nous-girl-dark.png')).toBe('reagent/mark.png')
    expect(distributionLogo('light')).toBe('reagent/logo-light.webp')
    expect(distributionLink('https://github.com/NousResearch/hermes-agent/releases')).toBe(
      'https://github.com/CesaTor/phillis_one/commits/reagent'
    )
    expect(sharedMetricsAllowed()).toBe(false)
  })

  it('curates settings nav and search by allowlist, so new upstream pages stay hidden', () => {
    reagent()

    const nav = filterSettingsNav([
      { id: 'config:memory', children: [{ id: 'config:memory:persistent' }] },
      {
        id: 'config:model',
        children: [{ id: 'config:model:main' }, { id: 'config:model:fallbacks' }]
      },
      { id: 'gateway' },
      { id: 'some-future-page' }
    ])

    expect(nav).toEqual([
      { id: 'config:memory', children: [{ id: 'config:memory:persistent' }] },
      { id: 'config:model', children: [{ id: 'config:model:main' }] }
    ])

    const hits = filterSettingsSearch([
      { target: { view: 'config:memory' } },
      { target: { view: 'providers', providerView: 'keys', key: 'OPENROUTER_API_KEY' } },
      { target: { view: 'providers', providerView: 'keys', key: 'REQURV_HIVE_API_KEY' } },
      { target: { view: 'config:voice' } }
    ])

    expect(hits.map(hit => hit.target.key ?? hit.target.view)).toEqual(['config:memory', 'REQURV_HIVE_API_KEY'])
  })

  it('drops core palette jumps it does not allow but keeps plugin rows', () => {
    reagent()

    const groups = filterPaletteGroups([
      { items: [{ id: 'nav-settings' }, { id: 'nav-cron' }, { id: 'hermes-bots:new-bot' }] },
      { items: [{ id: 'cc-usage' }] }
    ])

    expect(groups).toEqual([{ items: [{ id: 'nav-settings' }, { id: 'hermes-bots:new-bot' }] }])
  })

  it('renames the product in copy but leaves CLI commands, paths and env names alone', () => {
    reagent()

    const t = brandTranslations({
      about: 'Hermes Desktop by Nous Research',
      hint: 'Run `hermes model` or set HERMES_HOME',
      service: "Hermes' background service",
      update: (version: string) => `Update Hermes to ${version}`
    })

    expect(t.about).toBe('ReAgent by ReQurv Hive')
    expect(t.hint).toBe('Run `hermes model` or set HERMES_HOME')
    expect(t.service).toBe("ReAgent's background service")
    expect(t.update('1.2')).toBe('Update ReAgent to 1.2')
    expect(brandText('HERMES AGENT')).toBe('REAGENT')
  })
})
