import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { describe, test } from 'vitest'

const desktop = path.resolve(import.meta.dirname, '..')

// The packaging config as electron-builder would read it for a distribution, in a clean child
// process: the config and the identity decide at require time from the environment.
function resolvedConfig(distribution) {
  const script = `
    const c = require('./electron-builder.config.cjs')
    console.log(JSON.stringify({
      copyright: c.copyright ?? null,
      description: c.extraMetadata.description ?? null,
      dmg: { icon: c.dmg.icon, title: c.dmg.title, background: c.dmg.background, window: c.dmg.window, contents: c.dmg.contents },
      msix: { publisher: c.msix.publisher, publisherDisplayName: c.msix.publisherDisplayName, displayName: c.msix.displayName }
    }))`
  const result = spawnSync(process.execPath, ['-e', script], {
    cwd: desktop,
    encoding: 'utf8',
    env: {
      ...process.env,
      HERMES_DISTRIBUTION: distribution,
      HERMES_DESKTOP_VARIANT: '',
      HERMES_BUILD_COMMIT: '',
      HERMES_PAYLOAD_TAG: ''
    }
  })
  assert.equal(result.status, 0, result.stderr)
  return JSON.parse(result.stdout)
}

const listing = dir => fs.readdirSync(path.join(desktop, dir)).filter(name => name.endsWith('.png')).sort()

describe('ReAgent installer packaging', () => {
  const reagent = resolvedConfig('reagent')

  test('the DMG window is titled, drawn and iconned as ReAgent, never as Hermes or Nous', () => {
    assert.equal(reagent.dmg.title, 'ReAgent Installer')
    assert.equal(reagent.dmg.background, 'packaging/reagent/dmg-background.tiff')
    assert.equal(reagent.dmg.icon, 'packaging/reagent/dmg-volume.icns')
    for (const file of [reagent.dmg.background, reagent.dmg.icon]) {
      assert.ok(fs.existsSync(path.join(desktop, file)), `${file} is missing`)
    }
  })

  test('the DMG keeps upstream window geometry so the app icon and the Applications link land on the artwork', () => {
    const upstream = resolvedConfig('')
    assert.deepEqual(reagent.dmg.window, upstream.dmg.window)
    assert.deepEqual(reagent.dmg.contents, upstream.dmg.contents)
  })

  test('the MSIX logos come from ReAgent\'s own set, with exactly the file names upstream ships', () => {
    const upstreamNames = listing('assets/appx')
    assert.ok(upstreamNames.length > 0)
    assert.deepEqual(listing('assets/reagent/appx'), upstreamNames)
  })

  test('the store listing names ReQurv as publisher, with its own description and copyright', () => {
    assert.equal(reagent.msix.publisherDisplayName, 'ReQurv')
    assert.equal(reagent.msix.displayName, 'ReAgent')
    assert.match(reagent.description, /ReAgent/)
    assert.equal(reagent.copyright, 'Copyright (c) 2026 ReQurv')
    for (const text of [reagent.msix.publisherDisplayName, reagent.description, reagent.copyright, reagent.dmg.title]) {
      assert.doesNotMatch(text, /hermes|nous/i)
    }
  })
})

describe('upstream installer packaging', () => {
  test('resolves to the values Hermes has always shipped', () => {
    assert.deepEqual(resolvedConfig(''), {
      copyright: null,
      description: null,
      dmg: {
        icon: 'packaging/dmg-volume.icns',
        title: 'Hermes Agent Installer',
        background: 'packaging/nous-dmg-2b.tiff',
        window: { width: 660, height: 400 },
        contents: [
          { x: 253, y: 238, type: 'file' },
          { x: 512, y: 235, type: 'link', path: '/Applications' }
        ]
      },
      msix: {
        publisher: 'CN=Nous Research Inc., O=Nous Research Inc., L=Austin, S=Texas, C=US',
        publisherDisplayName: 'Nous Research',
        displayName: 'Hermes'
      }
    })
  })
})
