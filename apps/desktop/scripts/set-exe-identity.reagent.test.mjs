import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'vitest'

import { stampExeIdentity } from './set-exe-identity.mjs'

function desktopRootWith(iconDirs) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reagent-exe-identity-'))
  for (const dir of iconDirs) {
    fs.mkdirSync(path.join(root, dir), { recursive: true })
    fs.writeFileSync(path.join(root, dir, 'icon.ico'), dir)
  }
  const exe = path.join(root, 'App.exe')
  fs.writeFileSync(exe, 'exe')
  return { exe, root }
}

function identityFor(distribution) {
  const result = spawnSync(process.execPath, ['-e', "console.log(JSON.stringify(require('./product-identity.cjs')))"], {
    cwd: path.resolve(import.meta.dirname, '..'),
    encoding: 'utf8',
    env: { ...process.env, HERMES_DISTRIBUTION: distribution }
  })
  assert.equal(result.status, 0, result.stderr)
  return JSON.parse(result.stdout)
}

async function stampedWith(identity) {
  const { exe, root } = desktopRootWith(['assets', 'assets/reagent'])
  let options
  try {
    await stampExeIdentity(exe, root, {
      identity,
      rcedit: async (_exe, opts) => (options = opts),
      sleep: async () => {}
    })
    return { options, root }
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}

test("ReAgent's exe gets ReAgent's icon and version strings, not Hermes's", async () => {
  const { options, root } = await stampedWith(identityFor('reagent'))

  assert.equal(options.icon, path.join(root, 'assets/reagent', 'icon.ico'))
  assert.equal(options['version-string'].ProductName, 'ReAgent')
  assert.equal(options['version-string'].CompanyName, 'ReQurv')
})

test("upstream Hermes's exe keeps its icon and Nous Research version strings", async () => {
  const { options, root } = await stampedWith(identityFor(''))

  assert.equal(options.icon, path.join(root, 'assets', 'icon.ico'))
  assert.equal(options['version-string'].ProductName, 'Hermes')
  assert.equal(options['version-string'].CompanyName, 'Nous Research')
})
