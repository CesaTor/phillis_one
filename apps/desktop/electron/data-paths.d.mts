export function platformDefaultHermesHome(
  home: string,
  env?: NodeJS.ProcessEnv,
  platform?: NodeJS.Platform,
  homeName?: string,
): string

export function resolveDesktopUserData(defaultPath: string, env?: NodeJS.ProcessEnv): string

export interface HermesHomeOptions {
  home: string
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
  directoryExists?: (directory: string) => boolean
  readWindowsHome?: () => string | null
  /** The product identity's `hermesHomeName`; "hermes" when omitted. */
  homeName?: string
}

export function resolveDesktopHermesHome(options: HermesHomeOptions): string
