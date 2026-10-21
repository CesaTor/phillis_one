import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  appViewForPath,
  ARTIFACTS_ROUTE,
  CRON_ROUTE,
  MESSAGING_ROUTE,
  SETTINGS_ROUTE,
  STARMAP_ROUTE
} from '@/app/routes'

import { brandText, brandTranslations } from './branding'

import {
  distributionKeyOptions,
  distributionLink,
  filterModelOptions,
  filterPaletteGroups,
  filterSettingsNav,
  filterSettingsSearch,
  modelEffortAllowed,
  providerAllowed,
  remoteConnectionsAllowed,
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

describe('upstream Hermes (no distribution)', () => {
  it('keeps every route, provider and surface', () => {
    expect(appViewForPath(CRON_ROUTE)).toBe('cron')
    expect(appViewForPath(MESSAGING_ROUTE)).toBe('messaging')
    expect(filterModelOptions(catalog).providers).toHaveLength(3)
    expect(remoteConnectionsAllowed()).toBe(true)
    expect(distributionLink('https://github.com/NousResearch/hermes-agent/releases')).toBe(
      'https://github.com/NousResearch/hermes-agent/releases'
    )
    expect(sharedMetricsAllowed()).toBe(true)
    expect(brandText('HERMES AGENT')).toBe('HERMES AGENT')
    expect(modelEffortAllowed('requrv-hive', 'requrv-small-3.8', 'high')).toBe(true)
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

  it('is local-only and never offers Nous telemetry', () => {
    reagent()

    expect(remoteConnectionsAllowed()).toBe(false)
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
