// The desktop product identity — THE single source for every name-shaped
// value a variant owns. HERMES_DESKTOP_VARIANT=light builds "Hermes
// Light", the remote-only client; everything else is full "Hermes".
//
// Consumed at build time by electron-builder.config.cjs (packaging
// identity). electron/product-identity.ts is the typed runtime accessor.
// @ts-check
/// <reference types="node" />
'use strict'

const variants = {
  '': { display: 'Hermes', kebab: 'hermes', pascal: 'Hermes' },
  light: {
    display: 'Hermes Light',
    kebab: 'hermes-light',
    pascal: 'HermesLight'
  },
  bundled: {
    display: 'Hermes Agent',
    kebab: 'hermes-bundled',
    pascal: 'HermesBundled'
  }
}

const variant = process.env.HERMES_DESKTOP_VARIANT || ''
if (!['', 'light', 'bundled', 'store'].includes(variant)) {
  throw new Error(`Unknown HERMES_DESKTOP_VARIANT ${variant}. expected one of (empty), light, bundled, store`)
}

// 'store' is a Store-submission packaging identity layered on the bundled
// variant: same Electron app (displayName/appId/appNamePascal -> shared
// userData + single-instance lock with the out-of-store install), different
// MSIX package identity. The Store re-signs on submission.
// HERMES_DISTRIBUTION is the product, orthogonal to the variant (the payload
// shape): `reagent` is ReQurv's distribution — its own name, app identity and
// state, and no Nous release feed. The renderer reads the same variable
// (src/distribution) to curate its surface.
const distribution = process.env.HERMES_DISTRIBUTION || ''
if (!['', 'reagent'].includes(distribution)) {
  throw new Error(`Unknown HERMES_DISTRIBUTION ${distribution}. expected one of (empty), reagent`)
}
const reagent = distribution === 'reagent'

const store = variant === 'store'
const light = variant === 'light'
const name = reagent
  ? { display: 'ReAgent', kebab: 'reagent', pascal: 'ReAgent' }
  : variants[store ? 'bundled' : (variant || '')]

// The electron-updater feed channel this build PUBLISHES to. A canary
// tag (vX.Y.Z+canary.YYYYMMDDTHHMMSSZ) writes canary.yml / light-canary.yml;
// stable tags write latest.yml / light.yml. Keyed on the payload tag so
// the one release workflow serves both channels — a canary build can
// never overwrite the stable feed file, and vice versa.
const canary = /\+canary\.20\d{6}T\d{6}Z$/.test(process.env.HERMES_PAYLOAD_TAG || '')

// Nonstable installs own their package family and local desktop state. The
// seven-character commit suffix also names the CLI and fits MSIX's name cap.
const buildCommitEnv = process.env.HERMES_BUILD_COMMIT || ''
const buildCommit = /^[a-f0-9]{40}$/.test(buildCommitEnv) ? buildCommitEnv.slice(0, 7) : null
const displayName = buildCommit
  ? `${name.display} ${buildCommit}`
  : canary
    ? `${name.display} Canary`
    : name.display

const kebabSuffix = buildCommit ? `-${buildCommit}` : canary ? '-canary' : ''
const pascalSuffix = buildCommit ? `Commit${buildCommit}` : canary ? 'Canary' : ''
const cliName = `${reagent ? 'reagent' : light ? 'hermes-light' : 'hermes'}${kebabSuffix}`
if (reagent && store) {
  throw new Error('ReAgent has no Store identity yet')
}
if (store && (canary || buildCommit)) {
  throw new Error('Store packaging is only eligible for stable releases')
}

/** @typedef {import("./product-identity.d.cts")} ProductIdentity */

/** @type {ProductIdentity} */
const identity = {
  store,
  light,
  displayName,
  appId: `${reagent ? 'ai.requrv' : 'com.nousresearch'}.${name.kebab}${kebabSuffix}`,
  // Store, commit and ReAgent builds do not publish to the Nous release feed.
  channel: store || buildCommit || reagent ? null : light ? (canary ? 'light-canary' : 'light') : (canary ? 'canary' : 'latest'),
  appNamePascal: `${name.pascal}${pascalSuffix}`,
  artifactNamePascal: name.pascal,
  windowsExecutableName: kebabSuffix ? cliName : displayName,
  cliName,
  msixAppIdWithOrg: `${reagent ? 'ReQurv' : 'NousResearch'}.${name.pascal}${pascalSuffix}`,
  iconDir: reagent ? 'assets/reagent' : 'assets',
  // Windows exe version-info strings; null keeps upstream's (set-exe-identity.mjs).
  exeVersionStrings: reagent
    ? {
        ProductName: 'ReAgent',
        FileDescription: 'ReAgent',
        CompanyName: 'ReQurv',
        LegalCopyright: 'Copyright (c) 2026 ReQurv'
      }
    : null,
  // What the installers show a user: DMG window and volume icon, MSIX logos and store text. Paths are
  // relative to apps/desktop; null `description`/`copyright` keep upstream's (package.json / default).
  packaging: reagent
    ? {
        dmgTitle: 'ReAgent Installer',
        dmgBackground: 'packaging/reagent/dmg-background.tiff',
        dmgVolumeIcon: 'packaging/reagent/dmg-volume.icns',
        appxDir: 'assets/reagent/appx',
        publisherDisplayName: 'ReQurv',
        description: 'ReAgent by ReQurv: a personal AI agent that runs on your own machine.',
        copyright: 'Copyright (c) 2026 ReQurv'
      }
    : {
        dmgTitle: 'Hermes Agent Installer',
        dmgBackground: 'packaging/nous-dmg-2b.tiff',
        dmgVolumeIcon: 'packaging/dmg-volume.icns',
        appxDir: 'assets/appx',
        publisherDisplayName: 'Nous Research',
        description: null,
        copyright: null
      },
  // ReAgent keeps its own state (~/.reagent): it must never share config,
  // memories, sessions or the gateway with a Hermes install on the machine.
  hermesHomeName: reagent ? 'reagent' : 'hermes',
  ...(store
    ? {
        storeMsix: {
          // Partner Center publisher identity (the account's publisher ID) —
          // validated + re-signed by the Store on submission.
          identityName: 'NousResearchInc.HermesAgent',
          publisher: 'CN=EE6D86E4-606F-4E38-B940-AD7248C9D519',
          publisherDisplayName: 'Nous Research Inc.'
        }
      }
    : {})
}

const { channelBuildRequest } = require('../../scripts/msix-shared.mjs')
const request = channelBuildRequest()

// A channel created with --branding stable copies stable's identity, so it IS
// the regular app. It must also run like one: a token would make the runtime
// pin a userData dir and single-instance lock that installed stable doesn't use.
// The updater reads the token from the stamped request, not from this export.
const officialChannel =
  request !== null &&
  ['appId', 'displayName', 'appNamePascal', 'artifactNamePascal', 'windowsExecutableName', 'cliName', 'msixAppIdWithOrg'].every(
    key => request.identity[key] === identity[key]
  )

module.exports = !request
  ? identity
  : Object.freeze(
      officialChannel
        ? { ...identity, channel: request.channel }
        : { ...request.identity, store: false, light: false, packaging: identity.packaging, channel: request.channel }
    )
