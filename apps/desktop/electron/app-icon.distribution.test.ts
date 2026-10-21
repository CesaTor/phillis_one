import assert from 'node:assert/strict'
import path from 'node:path'

import { test } from 'vitest'

import { appIconCandidates } from './app-icon'

const appRoot = '/Applications/ReAgent.app/Contents/Resources'
const identity = (p: string) => p

test("a distribution's own icon directory is tried before the upstream ladder", () => {
  assert.equal(
    appIconCandidates({ isWindows: false, appRoot, iconDir: 'assets/reagent', unpackedPathFor: identity })[0],
    path.join(appRoot, 'assets/reagent', 'icon.png')
  )
  assert.equal(
    appIconCandidates({ isWindows: true, appRoot, iconDir: 'assets/reagent', unpackedPathFor: identity })[0],
    path.join(appRoot, 'assets/reagent', 'icon.ico')
  )
})

test('upstream Hermes (iconDir "assets") keeps its ladder unchanged', () => {
  assert.deepEqual(
    appIconCandidates({ isWindows: false, appRoot, iconDir: 'assets', unpackedPathFor: identity }),
    appIconCandidates({ isWindows: false, appRoot, unpackedPathFor: identity })
  )
})
