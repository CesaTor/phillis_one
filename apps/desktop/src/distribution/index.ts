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
  /** "Add provider…" doors in the model menus (Edit models, the model picker). */
  addProvider: boolean
  /** `public/` images this distribution replaces (upstream path → its own). */
  assets: Readonly<Record<string, string>>
  /** Bundled plugins (`src/plugins/<id>`) allowed to register. */
  bundledPlugins: ReadonlySet<string>
  /** First-run "I'll choose a provider later": lands in the app with no provider configured. */
  chooseProviderLater: boolean
  /** Env-var credentials searchable from settings search (provider keys included). */
  credentialKeys: RegExp
  /** The `default` profile's @handle (shown, completed, routed). The backend's `hermes` alias keeps
   *  routing to it: agents stamp it, and older rooms carry it. */
  defaultBotHandle: string
  /** The `default` profile's bot name until the user gives it a title. */
  defaultBotName: string
  /** The theme a profile paints until it picks one (`DEFAULT_SKIN_NAME`). Absent: upstream's `nous`. */
  defaultTheme: string
  /** Full logo shown where upstream letters its wordmark (empty chat), per rendered theme. */
  logo: null | Readonly<{ dark: string; light: string }>
  /** Upstream URLs this distribution answers itself (release notes, docs). Others open as-is. */
  links: Readonly<Record<string, string>>
  /** Reasoning levels per `<provider>/<model>` where narrower than the shared ladder. Mirrors the
   *  provider plugin's wire clamp, so pickers never offer a level the model rejects. */
  modelEfforts: Readonly<Record<string, ReadonlySet<string>>>
  /** The launch reason above the onboarding picker (backend copy such as "not connected to any
   *  AI provider… Run `hermes model`"). Off where the picker explains its one key itself. */
  onboardingReason: boolean
  /** Command-palette rows in the core namespaces (`CORE_PALETTE_PREFIXES`). */
  paletteItems: ReadonlySet<string>
  /** Optional plugin surfaces (`<plugin>:<surface>`) shown; a plugin asks with `ctx.surfaceAllowed`. */
  pluginSurfaces: ReadonlySet<string>
  /** Provider slugs (the backend provider catalog's ids). */
  providers: ReadonlySet<string>
  /** Remote gateways (connect to an existing backend, Hermes Cloud). Off = local-only. */
  remoteConnections: boolean
  /** The core Sessions pane (the SESSIONS tab beside BOTS). Off: it never registers, so it has no
   *  tab, ⌘K toggle or zone-menu row, and the Bots pane docked in its zone is the whole sidebar. */
  sessionsPane: boolean
  /** Settings nav groups (a `SettingsView` id). */
  settingsGroups: ReadonlySet<string>
  /** Per group, the child rows kept; a group absent here keeps all of them. */
  settingsChildren: Readonly<Record<string, ReadonlySet<string>>>
  /** Offer Nous's shared usage metrics (they post to Nous's telemetry endpoint). */
  sharedMetrics: boolean
  /** Core statusbar items (plugin-contributed items pass). */
  statusbarItems: ReadonlySet<string>
  /** Built-in themes this distribution owns (`src/distribution/theme.ts`), by name. Upstream has none. */
  themes: ReadonlySet<string>
  /** Built-in sidebar nav rows (`SIDEBAR_NAV` ids). */
  sidebarNav: ReadonlySet<string>
  /** Fixed titlebar tools (`TITLEBAR_FIXED_TOOLS` ids) bar the left-sidebar toggle; pane and plugin
   *  tools pass. A hidden tool takes the keybinds and ⌘K rows that drive it along. */
  titlebarTools: ReadonlySet<string>
  /** App views reachable by route; anything else lands on a new chat. */
  views: ReadonlySet<AppView>
  /** Composer voice: dictation, voice conversation, read-aloud. */
  voice: boolean
}

const REAGENT: DistributionPolicy = {
  addProvider: false,
  assets: { 'nous-girl.png': 'reagent/mark.png', 'nous-girl-dark.png': 'reagent/mark.png' },
  bundledPlugins: new Set(['hermes-bots']),
  // Without a Hive key the bot chat cannot open (the backend rejects a session with no model).
  chooseProviderLater: false,
  credentialKeys: /^REQURV_HIVE_/,
  defaultBotHandle: 'requrv',
  defaultBotName: 'ReQurv',
  defaultTheme: 'requrv',
  logo: { dark: 'reagent/logo-dark.webp', light: 'reagent/logo-light.webp' },
  links: {
    // ReAgent ships from its fork's branch, not tagged releases: its commits are its notes.
    'https://github.com/NousResearch/hermes-agent/releases': 'https://github.com/CesaTor/phillis_one/commits/reagent'
  },
  modelEfforts: { 'requrv-hive/requrv-small-3.8': new Set(['low', 'medium', 'xhigh']) },
  onboardingReason: false,
  paletteItems: new Set(['nav-new', 'nav-new-window', 'nav-settings', 'nav-starmap', 'cc-reload-window']),
  // Not `hermes-bots:gateway-groups` (the Bots pane's "Refresh gateway groups" list): with one
  // local gateway its rooms are the group chats the roster already lists, and a group row
  // reopens its room by name (resolveCanonicalGroup), never through that list.
  pluginSurfaces: new Set(),
  providers: new Set(['requrv-hive']),
  remoteConnections: false,
  sessionsPane: false,
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
    // Not the HUD gesture (a modifier tap summons the HUD window): ReAgent has no HUD.
    keybinds: new Set(['keybinds:shortcuts', 'keybinds:screen-capture']),
    providers: new Set(['pview:keys'])
  },
  sharedMetrics: false,
  sidebarNav: new Set(['new-session']),
  statusbarItems: new Set(['context-usage', 'running-timer', 'session-timer', 'version-client']),
  // Not `layout` (the layout editor) or `hud` (the floating HUD window): ReAgent keeps its preset
  // layout and lives in its own window.
  titlebarTools: new Set(['settings', 'flip-panes', 'right-sidebar']),
  themes: new Set(['requrv']),
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

// Keybind actions whose only job is a fixed titlebar tool's. They follow `titlebarTools`, so a
// hidden tool has no chord, keybinds-panel row or ⌘K row left to reach it by.
const TITLEBAR_TOOL_ACTIONS: Readonly<Record<string, readonly string[]>> = {
  hud: ['view.toggleHud', 'hud.snapToPointer'],
  layout: ['layout.editMode']
}

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

export function titlebarToolAllowed(tool: { id: string }): boolean {
  return policy()?.titlebarTools.has(tool.id) ?? true
}

/** `tools` minus the fixed titlebar tools this distribution hides. Generic, so a wrapped literal
 *  keeps its contextual type. */
export function filterTitlebarTools<T extends { id: string }>(tools: readonly T[]): T[] {
  return tools.filter(titlebarToolAllowed)
}

/** A keybind action (its chord, keybinds-panel row, ⌘K row): gone with the titlebar tool it drives. */
export function keybindActionAllowed(action: { id: string }): boolean {
  const p = policy()

  return (
    !p ||
    Object.entries(TITLEBAR_TOOL_ACTIONS).every(
      ([tool, actions]) => p.titlebarTools.has(tool) || !actions.includes(action.id)
    )
  )
}

export function filterKeybindActions<A extends { id: string }>(actions: readonly A[]): A[] {
  return actions.filter(keybindActionAllowed)
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

export function addProviderAllowed(): boolean {
  return policy()?.addProvider ?? true
}

export function chooseProviderLaterAllowed(): boolean {
  return policy()?.chooseProviderLater ?? true
}

export function onboardingReasonAllowed(): boolean {
  return policy()?.onboardingReason ?? true
}

export function sessionsPaneAllowed(): boolean {
  return policy()?.sessionsPane ?? true
}

/** Whether a plugin's optional surface shows (`ctx.surfaceAllowed`); upstream Hermes shows every one. */
export function pluginSurfaceAllowed(pluginId: string, surface: string): boolean {
  return policy()?.pluginSurfaces.has(`${pluginId}:${surface}`) ?? true
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

/** `request` through `filter` when a distribution curates it; upstream gets the very same promise
 *  back, so its timing (one microtask less) is exactly upstream's. */
export function distributionFiltered<R>(request: Promise<R>, filter: (result: R) => R): Promise<R> {
  return policy() ? request.then(filter) : request
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

/** A `public/` image path, or the one this distribution puts in its place. */
export function distributionAsset(path: string): string {
  return policy()?.assets[path] ?? path
}

/** The full logo for a rendered theme; null where upstream's lettering stays. */
export function distributionLogo(mode: 'dark' | 'light'): null | string {
  return policy()?.logo?.[mode] ?? null
}

/** `url`, or the page this distribution puts in its place. */
export function distributionLink(url: string): string {
  return policy()?.links[url] ?? url
}

/** The `default` profile's @handle; plugins read it as `ctx.defaultBotHandle`. */
export function defaultBotHandle(): string {
  return policy()?.defaultBotHandle ?? 'hermes'
}

export function defaultBotName(): string {
  return policy()?.defaultBotName ?? 'Hermes'
}

/** The theme a profile paints before it picks one; undefined leaves upstream's default (`nous`). */
export function defaultThemeName(): string | undefined {
  return policy()?.defaultTheme
}

/** Whether a distribution-owned built-in theme is registered. Upstream owns none, so none registers. */
export function themeAllowed(name: string): boolean {
  return policy()?.themes.has(name) ?? false
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

export function filterPaletteGroups<I extends { action?: string; id: string }, G extends PaletteGroupLike<I>>(
  groups: G[]
): G[] {
  const p = policy()

  if (!p) {
    return groups
  }

  const allowed = (item: I) =>
    (!item.action || keybindActionAllowed({ id: item.action })) &&
    (!CORE_PALETTE_PREFIXES.some(prefix => item.id.startsWith(prefix)) || p.paletteItems.has(item.id))

  return groups.map(group => ({ ...group, items: group.items.filter(allowed) })).filter(group => group.items.length > 0)
}
