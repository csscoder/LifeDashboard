import type { ThemeMode, ThemeStyle } from '@lifedashboard/contracts/theme'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { APPEARANCE_STORAGE_KEY, loadAppearance, saveAppearance } from '../app/theme/appearance'
import { DEFAULT_THEME, themeKey, themeMeta } from '../app/theme/builtin'
import { fontVars } from '../app/theme/fonts'
import { resolveTheme, resolveWidgetLook, themeClass } from '../app/theme/resolve'

const g = (mode: ThemeMode, style: ThemeStyle = 'glass') => ({ palette: 'builtin:gruvbox', mode, style })

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })

it('takes the first known choice and resolves auto', () => {
  expect(resolveTheme([null, { palette: 'builtin:nord', mode: 'dark', style: 'solid' }, g('auto')], 'light')).toBe('builtin:gruvbox-light-glass')
  expect(resolveTheme([undefined, null], 'dark')).toBe('builtin:lifedashboard-dark-glass')
  expect(themeKey(DEFAULT_THEME, 'light')).toBe('lifedashboard-dark-glass')
})
it('keeps an auto widget equal to an auto board non-foreign in both schemes', () => {
  for (const scheme of ['light', 'dark'] as const) {
    const board = resolveTheme([g('auto')], scheme)
    expect(resolveWidgetLook({ theme: g('auto'), shadow: null, variant: null }, board, scheme, g('auto')).foreign).toBe(false)
  }
})
it('marks a different choice foreign and keeps the board key for bare', () => {
  const board = 'builtin:gruvbox-dark-glass'
  expect(resolveWidgetLook({ theme: g('dark', 'solid'), shadow: null, variant: null }, board, 'dark', g('dark'))).toEqual({ themeId: 'builtin:gruvbox-dark-solid', skin: 'solid', foreign: true, fonts: {} })
  expect(resolveWidgetLook({ theme: 'bare', shadow: null, variant: null }, board, 'dark', g('dark'))).toEqual({ themeId: board, skin: 'bare', foreign: false, fonts: {} })
})
it.each([['undefined', undefined], ['null theme', { theme: null, shadow: null, variant: null }], ['unknown palette', { theme: { palette: 'builtin:nord', mode: 'dark', style: 'solid' }, shadow: null, variant: null }]] as const)(
  'a widget with %s inherits a non-default board', (_, appearance) => {
    expect(resolveWidgetLook(appearance, 'builtin:gruvbox-light-solid', 'dark', g('light', 'solid'))).toEqual({ themeId: 'builtin:gruvbox-light-solid', skin: 'solid', foreign: false, fonts: {} })
  })
describe('widget fonts', () => {
  const board = { ...g('dark'), heading: 'unbounded', body: 'inter' }
  const boardId = 'builtin:gruvbox-dark-glass'
  const look = (theme: unknown) => resolveWidgetLook({ theme, shadow: null, variant: null } as never, boardId, 'dark', board).fonts
  it.each([['null', null], ['bare', 'bare']])('a %s theme gets the board fonts', (_, theme) => {
    expect(look(theme)).toEqual(fontVars(board))
  })
  it('an undefined appearance gets the board fonts', () => {
    expect(resolveWidgetLook(undefined, boardId, 'dark', board).fonts).toEqual(fontVars(board))
  })
  it('a widget with its own palette and no fonts renders the system fonts', () => {
    expect(look({ palette: 'builtin:catppuccin', mode: 'dark', style: 'solid' })).toEqual({})
  })
  it('an own body font sets only the body variables', () => {
    expect(Object.keys(look({ palette: 'builtin:catppuccin', mode: 'dark', style: 'solid', body: 'lora' })).sort()).toEqual(['--ld-font-body', '--ld-font-ui'])
  })
  it('an own choice with an unknown palette inherits the board fonts', () => {
    expect(look({ palette: 'builtin:nord', mode: 'dark', style: 'solid' })).toEqual(fontVars(board))
  })
})
it('reads combination meta and defaults invalid ids', () => {
  expect(themeMeta('builtin:rose-pine-light-solid')).toEqual({ id: 'builtin:rose-pine-light-solid', mode: 'light', skin: 'solid' })
  for (const id of ['user:deleted', 'builtin:nord-dark-glass', 'builtin:gruvbox-auto-glass', 'builtin:gruvbox-dark-paper']) {
    expect(themeMeta(id)).toEqual({ id: 'builtin:lifedashboard-dark-glass', mode: 'dark', skin: 'glass' })
  }
})
it('maps a version 1 appearance', () => {
  vi.stubGlobal('localStorage', memoryStorage(JSON.stringify({ schemaVersion: 1, themeId: 'builtin:paper' })))
  expect(loadAppearance()).toEqual({ schemaVersion: 2, theme: { palette: 'builtin:lifedashboard', mode: 'light', style: 'solid' } })
  localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, themeId: 'builtin:bare' }))
  expect(loadAppearance().theme).toBeNull()
})
it('follows matchMedia changes with one shared readonly ref', async () => {
  const listeners: ((event: { matches: boolean }) => void)[] = []
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: (_: string, listener: typeof listeners[number]) => listeners.push(listener) }))
  const { useColorScheme } = await import('../app/theme/color-scheme')
  const scheme = useColorScheme()
  expect(scheme).toBe(useColorScheme())
  expect(scheme.value).toBe('light')
  listeners.forEach(listener => listener({ matches: true }))
  expect(scheme.value).toBe('dark')
  listeners.forEach(listener => listener({ matches: false }))
  expect(scheme.value).toBe('light')
})
it('defaults to dark without matchMedia', async () => {
  vi.stubGlobal('matchMedia', undefined)
  const { useColorScheme } = await import('../app/theme/color-scheme')
  expect(useColorScheme().value).toBe('dark')
})
it('maps CSS suffixes and rejects invalid namespaces', () => {
  expect(themeClass('builtin:gruvbox-dark-glass')).toBe('gruvbox-dark-glass')
  expect(themeClass('user:3f2a-11')).toBe('u-3f2a-11')
  expect(() => themeClass('glass')).toThrow(/Unknown theme id/)
})

function memoryStorage(initial?: string) {
  const data = new Map<string, string>()
  if (initial !== undefined) data.set(APPEARANCE_STORAGE_KEY, initial)
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
  }
}

describe('appearance storage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns defaults when nothing is stored', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    expect(loadAppearance()).toEqual({ schemaVersion: 2, theme: null })
  })

  it('round-trips a saved appearance', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    expect(saveAppearance({ schemaVersion: 2, theme: g('light', 'solid') })).toBe(true)
    expect(loadAppearance()).toEqual({ schemaVersion: 2, theme: g('light', 'solid') })
  })

  it.each([
    ['malformed JSON', '{'],
    ['a wrong schemaVersion', '{"schemaVersion":3,"theme":null}'],
    ['a non-string themeId', '{"schemaVersion":2,"theme":7}'],
    ['a missing themeId', '{"schemaVersion":2}'],
    ['an array', '[]'],
  ])('returns defaults for %s', (_, stored) => {
    vi.stubGlobal('localStorage', memoryStorage(stored))
    expect(loadAppearance()).toEqual({ schemaVersion: 2, theme: null })
  })

  it('drops unknown fields', () => {
    vi.stubGlobal('localStorage', memoryStorage('{"schemaVersion":2,"theme":null,"extra":1}'))
    expect(loadAppearance()).toEqual({ schemaVersion: 2, theme: null })
  })

  it('returns defaults when getItem throws or storage is missing', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied') } })
    expect(loadAppearance()).toEqual({ schemaVersion: 2, theme: null })
    vi.stubGlobal('localStorage', undefined)
    expect(loadAppearance()).toEqual({ schemaVersion: 2, theme: null })
  })

  it('returns false when setItem throws', () => {
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error('quota') } })
    expect(saveAppearance({ schemaVersion: 2, theme: g('light', 'solid') })).toBe(false)
  })
})
