import { fail, isRecord, type ParseResult } from './parse.ts'

export type ThemeMode = 'light' | 'dark' | 'auto'
export type ThemeStyle = 'solid' | 'glass'
export interface ThemeChoice {
  palette: string
  mode: ThemeMode
  style: ThemeStyle
  heading?: string
  body?: string
}
export const THEME_MODES: readonly ThemeMode[] = ['light', 'dark', 'auto']
export const THEME_STYLES: readonly ThemeStyle[] = ['solid', 'glass']

const SLUG = /^[a-z][a-z0-9-]{0,31}$/
const THEME_KEYS = ['palette', 'mode', 'style', 'heading', 'body']

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return isRecord(value) && Object.keys(value).every((key) => THEME_KEYS.includes(key)) &&
    typeof value.palette === 'string' && value.palette.startsWith('builtin:') && SLUG.test(value.palette.slice(8)) &&
    THEME_MODES.includes(value.mode as ThemeMode) && THEME_STYLES.includes(value.style as ThemeStyle) &&
    (['heading', 'body'] as const).every((key) => !Object.hasOwn(value, key) || (typeof value[key] === 'string' && SLUG.test(value[key])))
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
