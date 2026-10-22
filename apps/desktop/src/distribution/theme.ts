import type { DesktopTheme } from '@/themes/types'

import { defaultThemeName, themeAllowed } from '.'

// ReQurv's look, from requrv.io. The site is a near-black stage (#000 body,
// #06050e overlay) with neon purple #B81DF5, electric blue #2234DA and lavender
// #B392EF, set in Syne for running text. The dark palette is the site's own.
// The site has no light mode, so the light palette is derived: the same hues on a
// lavender-tinted off-white, with purple deepened to #9316D6 so white text on
// it clears 4.5:1, and blue as the accent.
const DARK: DesktopTheme['colors'] = {
  background: '#06050e',
  foreground: '#ffffff',
  card: '#0f0d1f',
  cardForeground: '#ffffff',
  muted: '#1b1e34',
  mutedForeground: '#9da5ae',
  popover: '#14122a',
  popoverForeground: '#ffffff',
  primary: '#b81df5',
  primaryForeground: '#ffffff',
  secondary: '#343451',
  secondaryForeground: '#ffffff',
  accent: '#241b45',
  accentForeground: '#ffffff',
  border: '#252529',
  input: '#343451',
  ring: '#b392ef',
  midground: '#b392ef',
  midgroundForeground: '#06050e',
  destructive: '#d9534f',
  destructiveForeground: '#06050e',
  sidebarBackground: '#0a0914',
  sidebarBorder: '#252529',
  userBubble: '#1b1e34',
  userBubbleBorder: '#343451'
}

const LIGHT: DesktopTheme['colors'] = {
  background: '#f6f5fb',
  foreground: '#06050e',
  card: '#ffffff',
  cardForeground: '#06050e',
  muted: '#ebe8f6',
  mutedForeground: '#4d4f63',
  popover: '#ffffff',
  popoverForeground: '#06050e',
  primary: '#9316d6',
  primaryForeground: '#ffffff',
  secondary: '#e3dff3',
  secondaryForeground: '#2b2250',
  accent: '#ece8fa',
  accentForeground: '#2b2250',
  border: '#d6d1e6',
  input: '#d6d1e6',
  ring: '#2234da',
  midground: '#2234da',
  midgroundForeground: '#ffffff',
  destructive: '#b3261e',
  destructiveForeground: '#ffffff',
  sidebarBackground: '#efecf8',
  sidebarBorder: '#d6d1e6',
  userBubble: '#e9e5f7',
  userBubbleBorder: '#d6d1e6'
}

// Syne ships in the app bundle (public/reagent/fonts, OFL 1.1), so the theme
// never waits on the network. Menda, the site's display face, is not bundled:
// its licence (Yukita Creative, all rights reserved) does not allow it.
export const REQURV_THEME: DesktopTheme = {
  name: 'requrv',
  label: 'ReQurv',
  description: 'ReQurv brand: near-black stage, neon purple and blue',
  colors: LIGHT,
  darkColors: DARK,
  typography: {
    fontSans:
      '"Syne", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif, ' +
      '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", emoji',
    fontUrl: `${import.meta.env.BASE_URL}reagent/fonts/syne.css`
  }
}

const DISTRIBUTION_THEMES: Record<string, DesktopTheme> = { requrv: REQURV_THEME }

/** The built-in themes this distribution adds to `BUILTIN_THEMES`. Upstream adds none. */
export function distributionThemes(): Record<string, DesktopTheme> {
  return Object.fromEntries(Object.entries(DISTRIBUTION_THEMES).filter(([name]) => themeAllowed(name)))
}

/** The default theme this distribution names, or undefined for upstream's `nous`. */
export function distributionDefaultTheme(): string | undefined {
  return defaultThemeName()
}
