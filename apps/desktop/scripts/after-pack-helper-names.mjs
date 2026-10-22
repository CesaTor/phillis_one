/**
 * after-pack-helper-names.mjs — macOS helper bundle names for permission prompts.
 *
 * Electron names each helper app `<Product> Helper (GPU).app` but ships
 * CFBundleName "Electron Helper ..." (CFBundleDisplayName carries the product
 * name). macOS privacy prompts such as local network access read CFBundleName,
 * so they say "Electron". Copy the display name over before signing: the signer
 * seals whatever the plist says.
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const PLUTIL = '/usr/bin/plutil'

function helperBundles(frameworksDir) {
  if (!fs.existsSync(frameworksDir)) return []
  return fs
    .readdirSync(frameworksDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.endsWith('.app') && entry.name.includes(' Helper'))
    .map(entry => path.join(frameworksDir, entry.name))
}

/**
 * Set each helper's CFBundleName to its own CFBundleDisplayName. Returns the
 * helper bundle names that were rewritten. A helper that cannot be rewritten
 * keeps its old name and is reported; packaging continues, as with the locale
 * markers.
 * @param {{ appOutDir: string, packager: { appInfo: { productFilename: string } } }} context
 */
export function restoreMacHelperNames({ appOutDir, packager }) {
  const frameworks = path.join(appOutDir, `${packager.appInfo.productFilename}.app`, 'Contents', 'Frameworks')
  const renamed = []
  for (const bundle of helperBundles(frameworks)) {
    const name = path.basename(bundle)
    const plist = path.join(bundle, 'Contents', 'Info.plist')
    try {
      // A missing key makes plutil fail; the error reports it, so its stderr stays quiet.
      const displayName = execFileSync(PLUTIL, ['-extract', 'CFBundleDisplayName', 'raw', '-o', '-', plist], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim()
      execFileSync(PLUTIL, ['-replace', 'CFBundleName', '-string', displayName, plist])
      renamed.push(name)
    } catch (error) {
      console.warn(
        `[after-pack] helper name not restored for ${name}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
  if (renamed.length > 0) console.log(`[after-pack] set CFBundleName on ${renamed.length} macOS helper bundles`)
  return renamed
}
