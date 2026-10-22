import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, test, vi } from 'vitest'
import { restoreMacHelperNames } from './after-pack-helper-names.mjs'

const productFilename = 'Hermes Preview'
const roots = []

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

function plistXml(entries) {
  const body = Object.entries(entries)
    .map(([key, value]) => `\t<key>${key}</key>\n\t<string>${value}</string>`)
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${body}
</dict>
</plist>
`
}

async function fakeApp(entries) {
  const appOutDir = await mkdtemp(path.join(os.tmpdir(), 'hermes-helper-names-'))
  roots.push(appOutDir)
  const frameworks = path.join(appOutDir, `${productFilename}.app`, 'Contents', 'Frameworks')
  for (const [name, plist] of Object.entries(entries)) {
    await mkdir(path.join(frameworks, name, 'Contents'), { recursive: true })
    await writeFile(path.join(frameworks, name, 'Contents', 'Info.plist'), plist)
  }
  // The framework itself is not a helper and must not be touched.
  await mkdir(path.join(frameworks, 'Electron Framework.framework'), { recursive: true })
  return { appOutDir, packager: { appInfo: { productFilename } }, frameworks }
}

function readPlistKey(plist, key) {
  return execFileSync('/usr/bin/plutil', ['-extract', key, 'raw', '-o', '-', plist], { encoding: 'utf8' }).trim()
}

test.runIf(process.platform === 'darwin')(
  'rewrites each helper CFBundleName to its own CFBundleDisplayName before signing',
  async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { appOutDir, packager, frameworks } = await fakeApp({
      'Hermes Preview Helper.app': plistXml({
        CFBundleName: 'Electron Helper',
        CFBundleDisplayName: 'Hermes Preview Helper',
        CFBundleExecutable: 'Hermes Preview Helper'
      }),
      'Hermes Preview Helper (GPU).app': plistXml({
        CFBundleName: 'Electron Helper (GPU)',
        CFBundleDisplayName: 'Hermes Preview Helper (GPU)',
        CFBundleExecutable: 'Hermes Preview Helper (GPU)'
      })
    })
    expect(restoreMacHelperNames({ appOutDir, packager })).toEqual([
      'Hermes Preview Helper (GPU).app',
      'Hermes Preview Helper.app'
    ])
    for (const name of ['Hermes Preview Helper.app', 'Hermes Preview Helper (GPU).app']) {
      const plist = path.join(frameworks, name, 'Contents', 'Info.plist')
      expect(readPlistKey(plist, 'CFBundleName')).toBe(readPlistKey(plist, 'CFBundleDisplayName'))
      // The executable is what the launcher resolves; only the name changes.
      expect(readPlistKey(plist, 'CFBundleExecutable')).toBe(name.replace(/\.app$/, ''))
    }
    expect(log).toHaveBeenCalledWith(expect.stringContaining('set CFBundleName on 2 macOS helper bundles'))
  }
)

test.runIf(process.platform === 'darwin')(
  'leaves a helper without a display name unchanged and reports it without failing packaging',
  async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const unnamed = plistXml({ CFBundleName: 'Electron Helper (Plugin)' })
    const { appOutDir, packager, frameworks } = await fakeApp({
      'Hermes Preview Helper (Plugin).app': unnamed
    })
    expect(restoreMacHelperNames({ appOutDir, packager })).toEqual([])
    expect(readPlistKey(path.join(frameworks, 'Hermes Preview Helper (Plugin).app', 'Contents', 'Info.plist'), 'CFBundleName'))
      .toBe('Electron Helper (Plugin)')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('helper name not restored for Hermes Preview Helper (Plugin).app'))
  }
)

it('is a no-op when the bundle has no Frameworks directory', async () => {
  const appOutDir = await mkdtemp(path.join(os.tmpdir(), 'hermes-helper-names-empty-'))
  roots.push(appOutDir)
  expect(restoreMacHelperNames({ appOutDir, packager: { appInfo: { productFilename } } })).toEqual([])
})
