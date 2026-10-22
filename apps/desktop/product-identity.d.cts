interface ProductIdentity {
  /** True when this artifact is Hermes Light (remote-only client). */
  light: boolean
  /** True for a Store-submission build (Windows Store packaging identity). */
  store: boolean
  /** Display name. e.g. "Hermes Light" */
  displayName: string
  /** OS-level app identity. e.g. "com.nousresearch.hermes-light" */
  appId: string
  /** app name in pascal case. e.g. "HermesLight" */
  appNamePascal: string
  /** Artifact prefix stays compatible with release archive consumers. */
  artifactNamePascal: string
  /** Windows GUI executable stem; not the payload CLI launcher path. */
  windowsExecutableName: string
  /** Exposed payload CLI command. */
  cliName: string
  /** OS-level app identity w/ org prefix. e.g. "NousResearch.HermesLight" */
  msixAppIdWithOrg: string
  /** App-icon directory (icon.png/.icns/.ico, icon-mac.png): "assets", or a distribution's own. */
  iconDir: string
  /** Installer artwork and store text (apps/desktop-relative paths). `description` and `copyright` are null for upstream's. */
  packaging: {
    dmgTitle: string
    dmgBackground: string
    dmgVolumeIcon: string
    appxDir: string
    publisherDisplayName: string
    description: string | null
    copyright: string | null
  }
  /** Windows exe version-info strings (ProductName...), or null for upstream's. */
  exeVersionStrings: Readonly<Record<string, string>> | null
  /** Default Hermes home: `~/.<name>` (macOS/Linux), `%LOCALAPPDATA%\<name>` (Windows). "hermes"
   *  upstream, a distribution's own otherwise. Absent on channel-build identities (= "hermes"). */
  readonly hermesHomeName?: string
  /** R2 identity token on channel builds; absent on legacy products. */
  readonly token?: string
  /** Channel subscription for channel builds; legacy electron-updater label otherwise. Stable tags:
   *  "latest" | "light"; canary tags: "canary" | "light-canary". Null
   *  for Store and commit builds (no release feed). */
  readonly channel: string | null
  /** Store-submission MSIX packaging identity. Present only when `store`. */
  storeMsix?: {
    identityName: string
    publisher: string
    publisherDisplayName: string
  }
}

declare const identity: ProductIdentity
export = identity
