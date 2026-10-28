import { fail, isRecord, type ParseResult } from './parse.ts'

export type ThemeMode = 'light' | 'dark' | 'auto'
export type ThemeStyle = 'solid' | 'glass'
export interface ThemeChoice {
  palette: string
  mode: ThemeMode
  style: ThemeStyle
}
export const THEME_MODES: readonly ThemeMode[] = ['light', 'dark', 'auto']
export const THEME_STYLES: readonly ThemeStyle[] = ['solid', 'glass']

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return isRecord(value) && Object.keys(value).length === 3 &&
    typeof value.palette === 'string' && /^builtin:[a-z][a-z0-9-]{0,31}$/.test(value.palette) &&
    THEME_MODES.includes(value.mode as ThemeMode) && THEME_STYLES.includes(value.style as ThemeStyle)
}

export function legacyTheme(themeId: unknown): ThemeChoice | 'bare' | null {
  if (themeId === 'builtin:bare') return 'bare'
  if (themeId === 'builtin:glass') return { palette: 'builtin:lifedashboard', mode: 'dark', style: 'glass' }
  if (themeId === 'builtin:obsidian') return { palette: 'builtin:lifedashboard', mode: 'dark', style: 'solid' }
  if (themeId === 'builtin:paper') return { palette: 'builtin:lifedashboard', mode: 'light', style: 'solid' }
  return null
}

export function readTheme(raw: Record<string, unknown>, allowBare: boolean): ParseResult<ThemeChoice | 'bare' | null> {
  const value = Object.hasOwn(raw, 'theme') ? raw.theme : legacyTheme(raw.themeId)
  if (value === null || isThemeChoice(value) || (value === 'bare' && allowBare)) return { ok: true, value }
  return fail('invalid theme')
}
