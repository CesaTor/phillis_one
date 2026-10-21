import type { AppView } from '@/app/routes'

// Which product this renderer is. `hermes` is upstream Hermes Desktop, every
// surface on. `reagent` is ReQurv's distribution: the same app with a curated,
// smaller surface and ReQurv Hive as its only provider. Picked at build time
// (`HERMES_DISTRIBUTION=reagent`), never at runtime: a distribution is a
// product, not a preference.
//
// Every gate is an ALLOWLIST. Upstream ships new pages, nav rows and settings
// constantly; in ReAgent they stay hidden until someone decides to let them in,
// so a sync with upstream can never surface an unreviewed feature. Hiding is
// presentation only: the backend keeps every capability (bots still own
// sessions, profiles and cron routines underneath).

export type DistributionId = 'hermes' | 'reagent'

interface DistributionPolicy {
  /** Bundled plugins (`src/plugins/<id>`) allowed to register. */
  bundledPlugins: ReadonlySet<string>
  /** Env-var credentials searchable from settings search (provider keys included). */
  credentialKeys: RegExp
  /** The `default` profile's bot name until the user gives it a title. */
  defaultBotName: string
  /** Upstream URLs this distribution answers itself (release notes, docs). Others open as-is. */
  links: Readonly<Record<string, string>>
  /** Reasoning levels per `<provider>/<model>` where narrower than the shared ladder. Mirrors the
   *  provider plugin's wire clamp, so pickers never offer a level the model rejects. */
  modelEfforts: Readonly<Record<string, ReadonlySet<string>>>
  /** Command-palette rows in the core namespaces (`CORE_PALETTE_PREFIXES`). */
  paletteItems: ReadonlySet<string>
  /** Provider slugs (the backend provider catalog's ids). */
  providers: ReadonlySet<string>
  /** Remote gateways (connect to an existing backend, Hermes Cloud). Off = local-only. */
  remoteConnections: boolean
  /** Settings nav groups (a `SettingsView` id). */
  settingsGroups: ReadonlySet<string>
  /** Per group, the child rows kept; a group absent here keeps all of them. */
  settingsChildren: Readonly<Record<string, ReadonlySet<string>>>
  /** Offer Nous's shared usage metrics (they post to Nous's telemetry endpoint). */
  sharedMetrics: boolean
  /** Core statusbar items (plugin-contributed items pass). */
  statusbarItems: ReadonlySet<string>
  /** Built-in sidebar nav rows (`SIDEBAR_NAV` ids). */
  sidebarNav: ReadonlySet<string>
  /** App views reachable by route; anything else lands on a new chat. */
  views: ReadonlySet<AppView>
  /** Composer voice: dictation, voice conversation, read-aloud. */
  voice: boolean
}

const REAGENT: DistributionPolicy = {
  bundledPlugins: new Set(['hermes-bots']),
  credentialKeys: /^REQURV_HIVE_/,
  defaultBotName: 'ReQurv',
  links: {
    // ReAgent ships from its fork's branch, not tagged releases: its commits are its notes.
    'https://github.com/NousResearch/hermes-agent/releases': 'https://github.com/CesaTor/phillis_one/commits/reagent'
  },
  modelEfforts: { 'requrv-hive/requrv-small-3.8': new Set(['low', 'medium', 'xhigh']) },
  paletteItems: new Set(['nav-new', 'nav-new-window', 'nav-settings', 'nav-starmap', 'cc-reload-window']),
  providers: new Set(['requrv-hive']),
  remoteConnections: false,
  settingsGroups: new Set([
    'config:model',
    'config:chat',
    'config:appearance',
    'config:memory',
    'config:safety',
    'providers',
    'keybinds',
    'about'
  ]),
  settingsChildren: {
    // Fallbacks, auxiliary, delegation and MoA each pick another provider.
    'config:model': new Set(['config:model:main']),
    providers: new Set(['pview:keys'])
  },
  sharedMetrics: false,
  sidebarNav: new Set(['new-session']),
  statusbarItems: new Set(['context-usage', 'running-timer', 'session-timer', 'version-client']),
  views: new Set<AppView>(['chat', 'extension', 'settings', 'starmap']),
  voice: false
}

// Palette rows whose ids live in these namespaces are core navigation and
// settings jumps — they obey `paletteItems`. Plugin and appearance rows pass.
const CORE_PALETTE_PREFIXES = [
  'archived-',
  'cap-',
  'cc-',
  'mcp-',
  'nav-',
  'open-folder-',
  'pinned-',
  'project-',
  'session-',
  'set-'
]

export function distribution(): DistributionId {
  return import.meta.env.HERMES_DISTRIBUTION === 'reagent' ? 'reagent' : 'hermes'
}

function policy(): DistributionPolicy | null {
  return distribution() === 'reagent' ? REAGENT : null
}

export function viewAllowed(view: AppView): boolean {
  return policy()?.views.has(view) ?? true
}

export function sidebarNavAllowed(item: { id: string }): boolean {
  return policy()?.sidebarNav.has(item.id) ?? true
}

export function statusbarItemAllowed(item: { id: string }): boolean {
  return policy()?.statusbarItems.has(item.id) ?? true
}

export function remoteConnectionsAllowed(): boolean {
  return policy()?.remoteConnections ?? true
}

export function sharedMetricsAllowed(): boolean {
  return policy()?.sharedMetrics ?? true
}

export function voiceAllowed(): boolean {
  return policy()?.voice ?? true
}

export function bundledPluginAllowed(id: string): boolean {
  return policy()?.bundledPlugins.has(id) ?? true
}

export function providerAllowed(slug: string | null | undefined): boolean {
  const p = policy()

  return !p || Boolean(slug && p.providers.has(slug))
}

/** The model catalog (gateway `model.options` / REST `/api/model/options`) minus hidden providers. */
export function filterModelOptions<R extends { providers?: { slug: string }[] }>(result: R): R {
  const p = policy()

  return p && result?.providers
    ? { ...result, providers: result.providers.filter(row => p.providers.has(row.slug)) }
    : result
}

export function filterOAuthProviders<R extends { providers: { id: string }[] }>(result: R): R {
  const p = policy()

  return p ? { ...result, providers: result.providers.filter(row => p.providers.has(row.id)) } : result
}

interface KeyOption {
  docsUrl: string
  envKey: string
  id: string
  name: string
  placeholder?: string
}

const REQURV_HIVE_KEY: KeyOption = {
  docsUrl: 'https://hive.requrv.ai/',
  envKey: 'REQURV_HIVE_API_KEY',
  id: 'requrv-hive',
  name: 'ReQurv Hive',
  placeholder: 'requrv_sk_…'
}

/** The paste-a-key providers onboarding recommends before the backend catalog arrives. */
export function distributionKeyOptions<O extends KeyOption>(upstream: O[]): O[] {
  return policy() ? [REQURV_HIVE_KEY as O] : upstream
}

/** Whether a model offers this reasoning level (`none` = thinking can be switched off). */
export function modelEffortAllowed(provider: string, model: string, effort: string): boolean {
  return policy()?.modelEfforts[`${provider}/${model}`]?.has(effort) ?? true
}

/** `url`, or the page this distribution puts in its place. */
export function distributionLink(url: string): string {
  return policy()?.links[url] ?? url
}

export function defaultBotName(): string {
  return policy()?.defaultBotName ?? 'Hermes'
}

export function settingsViewAllowed(view: string): boolean {
  return policy()?.settingsGroups.has(view) ?? true
}

interface SettingsNavNode {
  children?: SettingsNavNode[]
  id: string
}

export function filterSettingsNav<T extends SettingsNavNode>(groups: T[]): T[] {
  const p = policy()

  if (!p) {
    return groups
  }

  return groups
    .filter(group => p.settingsGroups.has(group.id))
    .map(group => {
      const kept = p.settingsChildren[group.id]

      return kept && group.children ? { ...group, children: group.children.filter(child => kept.has(child.id)) } : group
    })
}

interface SettingsTargetLike {
  key?: string
  providerView?: string
  subpage?: string
  view: string
}

function settingsTargetAllowed(p: DistributionPolicy, target: SettingsTargetLike): boolean {
  if (!p.settingsGroups.has(target.view)) {
    return false
  }

  if (target.key && !p.credentialKeys.test(target.key)) {
    return false
  }

  const kept = p.settingsChildren[target.view]

  const child = target.subpage
    ? `${target.view}:${target.subpage}`
    : target.providerView && `pview:${target.providerView}`

  return !kept || !child || kept.has(child)
}

/** Settings-search rows (palette + settings page) pointing into hidden pages drop out. */
export function filterSettingsSearch<E extends { target: SettingsTargetLike }>(entries: E[]): E[] {
  const p = policy()

  return p ? entries.filter(entry => settingsTargetAllowed(p, entry.target)) : entries
}

interface PaletteGroupLike<I extends { id: string }> {
  items: I[]
}

export function filterPaletteGroups<I extends { id: string }, G extends PaletteGroupLike<I>>(groups: G[]): G[] {
  const p = policy()

  if (!p) {
    return groups
  }

  const allowed = (item: I) =>
    !CORE_PALETTE_PREFIXES.some(prefix => item.id.startsWith(prefix)) || p.paletteItems.has(item.id)

  return groups.map(group => ({ ...group, items: group.items.filter(allowed) })).filter(group => group.items.length > 0)
}
