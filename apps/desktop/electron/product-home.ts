// product-home.ts — the Hermes home a desktop product owns.
//
// Upstream Hermes keeps its state in ~/.hermes (%LOCALAPPDATA%\hermes on
// Windows). A distribution with its own `hermesHomeName` (ReAgent: ~/.reagent)
// must never share config, memories, profiles, sessions or the gateway with a
// Hermes install on the same machine, so its default home, the runtime it
// installs under that home, and every child it spawns stay inside it. An
// explicit HERMES_HOME still wins, exactly as upstream.
import { type HermesHomeOptions, resolveDesktopHermesHome } from './data-paths'
import { PRODUCT_IDENTITY, type ProductIdentity } from './product-identity'
import { userLauncherInstallRoot } from './updater-process'

const UPSTREAM_HOME_NAME = 'hermes'

type HomeIdentity = Pick<ProductIdentity, 'hermesHomeName'>

function ownsSeparateHome(identity: HomeIdentity): boolean {
  return (identity.hermesHomeName ?? UPSTREAM_HOME_NAME) !== UPSTREAM_HOME_NAME
}

/** resolveDesktopHermesHome with this product's default home. */
export function resolveProductHermesHome(
  options: Omit<HermesHomeOptions, 'homeName'>,
  identity: HomeIdentity = PRODUCT_IDENTITY
): string {
  return resolveDesktopHermesHome({ ...options, homeName: identity.hermesHomeName })
}

/**
 * The main process's HERMES_HOME. A product with its own home also exports it,
 * so every child (backend, gateway, `--version` probes, installer, terminals)
 * resolves the same home even where a spawn site passes no HERMES_HOME: a
 * Hermes CLI without it falls back to ~/.hermes. Upstream leaves the
 * environment untouched.
 */
export function claimProductHermesHome(
  options: Omit<HermesHomeOptions, 'homeName'>,
  identity: HomeIdentity = PRODUCT_IDENTITY
): string {
  const env: NodeJS.ProcessEnv = options.env ?? process.env
  const home: string = resolveProductHermesHome({ ...options, env }, identity)

  if (ownsSeparateHome(identity) && !env.HERMES_HOME) {
    env.HERMES_HOME = home
  }

  return home
}

/**
 * The source install a published user-bin `hermes` launcher reports
 * (~/.local/bin, the default home's bin). Those launchers belong to upstream
 * Hermes: a product with its own home runs only the runtime under that home,
 * never an existing Hermes install.
 */
export function productUserLauncherInstall(
  isWindows: boolean,
  hermesHome: string,
  identity: HomeIdentity = PRODUCT_IDENTITY
): ReturnType<typeof userLauncherInstallRoot> {
  return ownsSeparateHome(identity) ? null : userLauncherInstallRoot(isWindows, hermesHome)
}
