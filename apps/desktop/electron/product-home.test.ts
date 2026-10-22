import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, test, vi } from 'vitest'

import { claimProductHermesHome, productUserLauncherInstall, resolveProductHermesHome } from './product-home'
import { resolveSourceInstallationBackend } from './source-backend'

const REAGENT = { hermesHomeName: 'reagent', distribution: 'reagent' }
const UPSTREAM = { hermesHomeName: 'hermes' }

afterEach((): void => {
  vi.unstubAllEnvs()
})

test('ReAgent defaults to ~/.reagent on macOS/Linux and %LOCALAPPDATA%\\reagent on Windows', (): void => {
  for (const platform of ['darwin', 'linux'] as const) {
    const home = resolveProductHermesHome({ home: '/Users/test', env: {}, platform }, REAGENT)

    assert.equal(home, '/Users/test/.reagent')
  }

  const local = 'C:\\Users\\test\\AppData\\Local'

  assert.equal(
    resolveProductHermesHome({ home: 'C:\\Users\\test', env: { LOCALAPPDATA: local }, platform: 'win32' }, REAGENT),
    'C:\\Users\\test\\AppData\\Local\\reagent'
  )
})

test('upstream Hermes keeps ~/.hermes and %LOCALAPPDATA%\\hermes, with or without the field', (): void => {
  const local = 'C:\\Users\\test\\AppData\\Local'

  for (const identity of [UPSTREAM, {}]) {
    assert.equal(
      resolveProductHermesHome({ home: '/home/test', env: {}, platform: 'linux' }, identity),
      '/home/test/.hermes'
    )
    assert.equal(
      resolveProductHermesHome({ home: 'C:\\Users\\test', env: { LOCALAPPDATA: local }, platform: 'win32' }, identity),
      'C:\\Users\\test\\AppData\\Local\\hermes'
    )
  }
})

test('ReAgent on Windows never migrates into a legacy Hermes home at ~\\.hermes', (): void => {
  const options = {
    home: 'C:\\Users\\test',
    env: { LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local' },
    platform: 'win32' as const,
    directoryExists: (dir: string): boolean => dir === 'C:\\Users\\test\\.hermes'
  }

  assert.equal(resolveProductHermesHome(options, REAGENT), 'C:\\Users\\test\\AppData\\Local\\reagent')
  // The fixture is real: upstream does adopt that legacy home.
  assert.equal(resolveProductHermesHome(options, UPSTREAM), 'C:\\Users\\test\\.hermes')
})

test('an explicit HERMES_HOME wins for ReAgent and is never overwritten', (): void => {
  const env: NodeJS.ProcessEnv = { HERMES_HOME: '/sandbox/hermes-home' }

  assert.equal(claimProductHermesHome({ home: '/home/test', env, platform: 'linux' }, REAGENT), '/sandbox/hermes-home')
  assert.equal(env.HERMES_HOME, '/sandbox/hermes-home')
})

test('ReAgent exports its home to children; upstream leaves the environment alone', (): void => {
  const reagentEnv: NodeJS.ProcessEnv = {}
  const upstreamEnv: NodeJS.ProcessEnv = {}

  assert.equal(
    claimProductHermesHome({ home: '/home/test', env: reagentEnv, platform: 'linux' }, REAGENT),
    '/home/test/.reagent'
  )
  assert.equal(reagentEnv.HERMES_HOME, '/home/test/.reagent')

  assert.equal(
    claimProductHermesHome({ home: '/home/test', env: upstreamEnv, platform: 'linux' }, UPSTREAM),
    '/home/test/.hermes'
  )
  assert.equal('HERMES_HOME' in upstreamEnv, false)
})

test('ReAgent exports HERMES_DISTRIBUTION to children, with or without an explicit home; upstream does not', (): void => {
  const implicit: NodeJS.ProcessEnv = {}
  const explicit: NodeJS.ProcessEnv = { HERMES_HOME: '/sandbox/hermes-home' }
  const upstream: NodeJS.ProcessEnv = {}

  claimProductHermesHome({ home: '/home/test', env: implicit, platform: 'linux' }, REAGENT)
  claimProductHermesHome({ home: '/home/test', env: explicit, platform: 'linux' }, REAGENT)
  claimProductHermesHome({ home: '/home/test', env: upstream, platform: 'linux' }, UPSTREAM)

  assert.equal(implicit.HERMES_DISTRIBUTION, 'reagent')
  assert.equal(explicit.HERMES_DISTRIBUTION, 'reagent')
  assert.equal('HERMES_DISTRIBUTION' in upstream, false)
})

// A machine with Hermes installed the usual way: ~/.hermes/hermes-agent with
// its PM launcher, and the ~/.local/bin/hermes launcher install.sh publishes.
test.skipIf(process.platform === 'win32')(
  'ReAgent does not pick up an installed Hermes runtime under ~/.hermes',
  async (): Promise<void> => {
    const base: string = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'product-home-')))

    try {
      const home: string = path.join(base, 'home')
      const hermesRoot: string = path.join(home, '.hermes', 'hermes-agent')
      fs.mkdirSync(path.join(hermesRoot, 'hermes_cli'), { recursive: true })
      fs.mkdirSync(path.join(hermesRoot, 'pm'))
      fs.writeFileSync(path.join(hermesRoot, 'hermes_cli', 'main.py'), '')

      const launcherBody = `#!/bin/sh\nprintf '%s\\n' 'Install directory: ${hermesRoot}'\n`

      for (const dir of [path.join(hermesRoot, '.hermes', 'bin'), path.join(home, '.local', 'bin')]) {
        fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(path.join(dir, 'hermes'), launcherBody, { mode: 0o755 })
      }

      vi.stubEnv('HOME', home)

      const resolveActive = async (identity: typeof REAGENT) => {
        const hermesHome = resolveProductHermesHome({ home, env: {}, platform: 'linux' }, identity)

        // main.ts: ACTIVE_HERMES_ROOT = <HERMES_HOME>/hermes-agent
        return {
          active: await resolveSourceInstallationBackend(path.join(hermesHome, 'hermes-agent'), ['serve'], {
            isWindows: false,
            hermesHome
          }),
          userBin: productUserLauncherInstall(false, hermesHome, identity)
        }
      }

      // The fixture is a usable Hermes install: upstream adopts it on both rungs.
      const upstream = await resolveActive(UPSTREAM)
      assert.equal(upstream.active?.root, hermesRoot)
      assert.equal(upstream.userBin?.root, hermesRoot)

      const reagent = await resolveActive(REAGENT)
      assert.equal(reagent.active, null)
      assert.equal(reagent.userBin, null)
    } finally {
      fs.rmSync(base, { recursive: true, force: true })
    }
  }
)
