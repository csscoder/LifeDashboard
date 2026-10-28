import { expect, it } from 'vitest'
import { isThemeChoice, legacyTheme, readTheme } from '../src/theme.ts'
const gruvbox = { palette: 'builtin:gruvbox', mode: 'auto', style: 'glass' }
it('accepts exact choices and rejects extra keys and invalid values', () => {
  expect(isThemeChoice(gruvbox)).toBe(true)
  for (const value of [null, [], {}, { ...gruvbox, x: 1 }, { ...gruvbox, mode: 'dim' }, { ...gruvbox, style: 'flat' }, { ...gruvbox, palette: 'user:1' }, { ...gruvbox, palette: 'builtin:Nord' }]) expect(isThemeChoice(value)).toBe(false)
})
it.each([
  ['builtin:glass', { palette: 'builtin:lifedashboard', mode: 'dark', style: 'glass' }],
  ['builtin:obsidian', { palette: 'builtin:lifedashboard', mode: 'dark', style: 'solid' }],
  ['builtin:paper', { palette: 'builtin:lifedashboard', mode: 'light', style: 'solid' }],
  ['builtin:bare', 'bare'], ['builtin:nope', null], [null, null], [42, null],
])('maps legacy %s', (id, expected) => expect(legacyTheme(id)).toEqual(expected))
it('prefers theme over themeId including null and rejects bare when disallowed', () => {
  expect(readTheme({ theme: null, themeId: 'builtin:glass' }, false)).toEqual({ ok: true, value: null })
  expect(readTheme({ themeId: 'builtin:paper' }, false)).toEqual({ ok: true, value: { palette: 'builtin:lifedashboard', mode: 'light', style: 'solid' } })
  expect(readTheme({ theme: { palette: 'x' }, themeId: 'builtin:glass' }, false)).toEqual({ ok: false, error: 'invalid theme' })
  expect(readTheme({ theme: 'bare' }, false).ok).toBe(false)
  expect(readTheme({ theme: 'bare' }, true)).toEqual({ ok: true, value: 'bare' })
  expect(readTheme({ themeId: 'builtin:bare' }, false).ok).toBe(false)
  expect(readTheme({}, false)).toEqual({ ok: true, value: null })
})
it.each(['a', 'a1-', 'a'.repeat(32)])('accepts palette slug %s within the boundaries', (slug) => {
  expect(isThemeChoice({ ...gruvbox, palette: `builtin:${slug}` })).toBe(true)
})
it.each(['', '1', '-foo', 'a'.repeat(33)])('rejects palette slug %s outside the boundaries', (slug) => {
  expect(isThemeChoice({ ...gruvbox, palette: `builtin:${slug}` })).toBe(false)
})
