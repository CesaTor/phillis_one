import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { contrastRatio } from '@hermes/shared/color'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The ReQurv theme: registered and default in ReAgent only. Each test loads the
// theme modules fresh so the distribution is read the way a build reads it.
async function loadThemes(distribution: 'reagent' | null) {
  vi.resetModules()

  if (distribution) {
    vi.stubEnv('HERMES_DISTRIBUTION', distribution)
  }

  const presets = await import('@/themes/presets')
  const context = await import('@/themes/context')
  const userThemes = await import('@/themes/user-themes')

  return { ...presets, ...context, ...userThemes }
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('ReAgent theme (HERMES_DISTRIBUTION=reagent)', () => {
  it('registers ReQurv as a built-in theme with light and dark palettes', async () => {
    const { BUILTIN_THEMES, listAllThemes, resolveTheme } = await loadThemes('reagent')
    const requrv = BUILTIN_THEMES.requrv

    expect(requrv).toBeDefined()
    expect(requrv.label).toBe('ReQurv')
    expect(requrv.colors).toBeDefined()
    expect(requrv.darkColors).toBeDefined()
    expect(resolveTheme('requrv')).toBe(requrv)
    expect(listAllThemes().map(theme => theme.name)).toContain('requrv')
  })

  it('makes ReQurv the default theme for a profile that never chose one', async () => {
    const { DEFAULT_SKIN_NAME, skinPref } = await loadThemes('reagent')

    expect(DEFAULT_SKIN_NAME).toBe('requrv')
    expect(skinPref.resolve('default')).toBe('requrv')
  })

  it('keeps the theme a user picked over the ReQurv default', async () => {
    const { skinPref } = await loadThemes('reagent')

    skinPref.assign('default', 'nous')

    expect(skinPref.resolve('default')).toBe('nous')
  })

  it('keeps body text and primary buttons at WCAG AA (4.5:1) in both modes', async () => {
    const { BUILTIN_THEMES } = await loadThemes('reagent')
    const { colors, darkColors } = BUILTIN_THEMES.requrv

    expect(darkColors).toBeDefined()

    for (const palette of [colors, darkColors!]) {
      expect(contrastRatio(palette.foreground, palette.background)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(palette.cardForeground, palette.card)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(palette.mutedForeground, palette.background)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(palette.mutedForeground, palette.muted)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(palette.primaryForeground, palette.primary)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(palette.destructiveForeground, palette.destructive)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('loads its fonts from the app bundle, never from the network', async () => {
    const { BUILTIN_THEMES } = await loadThemes('reagent')
    const { fontSans, fontUrl } = BUILTIN_THEMES.requrv.typography ?? {}

    expect(fontSans).toMatch(/^"Syne"/)
    expect(fontUrl).toBeDefined()
    expect(fontUrl).not.toMatch(/^[a-z]+:\/\//i)

    const relative = fontUrl!.replace(import.meta.env.BASE_URL, '')

    expect(existsSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../public', relative))).toBe(true)
  })
})

describe('upstream Hermes (no distribution)', () => {
  it('registers no ReQurv theme', async () => {
    const { BUILTIN_THEMES, resolveTheme } = await loadThemes(null)

    expect(BUILTIN_THEMES.requrv).toBeUndefined()
    expect(resolveTheme('requrv')).toBeUndefined()
  })

  it('keeps Nous as the default and the stored pick as the choice', async () => {
    const { DEFAULT_SKIN_NAME, skinPref } = await loadThemes(null)

    expect(DEFAULT_SKIN_NAME).toBe('nous')
    expect(skinPref.resolve('default')).toBe('nous')

    skinPref.assign('default', 'github')

    expect(skinPref.resolve('default')).toBe('github')
  })
})
