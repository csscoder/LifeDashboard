import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SHADOW,
  isUuid,
  normalizeAppearance,
  parseScreenBoard,
  type ScreenBoard,
} from '../src/board.ts'

const SCREEN = '5c2e8d17-93a4-4f6b-8e21-7d4b0a9c3e02'
const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'
const placeholder = { kind: 'builtin', type: 'placeholder' } as const

const valid: ScreenBoard = {
  id: SCREEN,
  rows: 10,
  instances: [
    { id: A, source: { ...placeholder }, configVersion: 1, config: {} },
    { id: B, source: { ...placeholder }, configVersion: 1, config: { title: 'x', nested: { n: 1 } } },
  ],
  layout: [
    { instanceId: A, x: 0, y: 0, w: 4, h: 4 },
    { instanceId: B, x: 4, y: 0, w: 2, h: 2 },
  ],
}

// Tests mutate a deep copy freely; the parser receives it as unknown input.
function mutated(change: (doc: any) => void): unknown {
  const doc = structuredClone(valid)
  change(doc)
  return doc
}

describe('isUuid', () => {
  it('accepts UUIDs in any case and rejects other values', () => {
    expect(isUuid(A)).toBe(true)
    expect(isUuid(A.toUpperCase())).toBe(true)
    expect(isUuid('a')).toBe(false)
    expect(isUuid(`${A}0`)).toBe(false)
    expect(isUuid(1)).toBe(false)
  })
})

describe('parseScreenBoard', () => {
  it('accepts a valid screen', () => {
    expect(parseScreenBoard(structuredClone(valid))).toEqual({ ok: true, value: valid })
  })

  it('maps a legacy screen theme and removes themeId', () => {
    expect(parseScreenBoard({ ...valid, themeId: 'builtin:glass' })).toEqual({ ok: true, value: {
      id: SCREEN, rows: 10, theme: { palette: 'builtin:lifedashboard', mode: 'dark', style: 'glass' }, instances: valid.instances, layout: valid.layout,
    } })
  })

  it('keeps an unknown syntactically valid palette', () => {
    const theme = { palette: 'builtin:nord', mode: 'dark', style: 'solid' }
    expect(parseScreenBoard({ ...valid, theme })).toEqual({ ok: true, value: { id: SCREEN, rows: 10, theme, instances: valid.instances, layout: valid.layout } })
  })

  it('keeps font slugs in a screen theme', () => {
    const theme = { palette: 'builtin:gruvbox', mode: 'dark', style: 'solid', heading: 'lora' }
    expect(parseScreenBoard({ ...valid, theme })).toEqual({ ok: true, value: { id: SCREEN, rows: 10, theme, instances: valid.instances, layout: valid.layout } })
  })

  it('omits a null screen theme for inheritance', () => {
    expect(parseScreenBoard({ ...valid, theme: null })).toEqual({ ok: true, value: valid })
  })

  it.each(['bare', 'paper', 7, {}])('rejects invalid screen theme %j', (theme) => {
    expect(parseScreenBoard({ ...valid, theme })).toEqual({ ok: false, error: 'invalid screen theme' })
  })

  it('accepts an unknown source.type', () => {
    expect(parseScreenBoard(mutated((d) => { d.instances[0].source.type = 'weather' })).ok).toBe(true)
  })

  it('accepts a legacy package version with leading zeros', () => {
    const source = { kind: 'package', packageId: 'dev.alex.pomodoro', version: '01.0.0' }
    const result = parseScreenBoard(mutated((d) => { d.instances[0].source = source }))
    expect(result.ok && result.value.instances[0]!.source).toEqual(source)
  })

  it('accepts a package source', () => {
    const source = { kind: 'package', packageId: 'dev.alex.pomodoro', version: '1.2.0' }
    const result = parseScreenBoard(mutated((d) => { d.instances[0].source = { ...source, extra: 1 } }))
    expect(result.ok && result.value.instances[0]!.source).toEqual(source)
  })

  it('accepts a placement below the configured rows (red zone)', () => {
    const raw = mutated((d) => { d.layout[1] = { instanceId: B, x: 20, y: 40, w: 2, h: 2 } })
    expect(parseScreenBoard(raw).ok).toBe(true)
  })

  it('accepts the row bounds 4 and 100', () => {
    expect(parseScreenBoard(mutated((d) => { d.rows = 4 })).ok).toBe(true)
    expect(parseScreenBoard(mutated((d) => { d.rows = 100 })).ok).toBe(true)
  })

  it('drops unknown fields', () => {
    const result = parseScreenBoard(mutated((d) => {
      d.extra = 1
      d.instances[0].extra = 1
      d.layout[0].extra = 1
    }))
    expect(result).toEqual({ ok: true, value: valid })
  })

  it.each([
    ['null', null, /must be an object/],
    ['an array', [], /must be an object/],
    ['a non-UUID screen id', mutated((d) => { d.id = 'main' }), /screen id must be a UUID/],
    ['non-array instances', mutated((d) => { d.instances = {} }), /must be arrays/],
    ['a non-UUID instance id', mutated((d) => { d.instances[0].id = 'a' }), /id must be a UUID/],
    ['a duplicate id', mutated((d) => { d.instances[1].id = A }), /duplicate id/],
    ['a custom source', mutated((d) => { d.instances[0].source = { kind: 'custom' } }), /invalid source/],
    ['a package source with a bad id', mutated((d) => { d.instances[0].source = { kind: 'package', packageId: 'X', version: '1.0.0' } }), /invalid source/],
    ['a package source with a bad version', mutated((d) => { d.instances[0].source = { kind: 'package', packageId: 'dev.a', version: 'latest' } }), /invalid source/],
    ['a missing configVersion', mutated((d) => { delete d.instances[0].configVersion }), /configVersion must be a positive integer/],
    ['a zero configVersion', mutated((d) => { d.instances[0].configVersion = 0 }), /configVersion must be a positive integer/],
    ['a fractional configVersion', mutated((d) => { d.instances[0].configVersion = 1.5 }), /configVersion must be a positive integer/],
    ['a missing config', mutated((d) => { delete d.instances[0].config }), /config must be an object/],
    ['a placement without an instance', mutated((d) => { d.layout[1].instanceId = 'zzz' }), /unknown instanceId "zzz"/],
    ['an instance without a placement', mutated((d) => { d.layout.pop() }), /has no placement/],
    ['two placements of one instance', mutated((d) => { d.layout[1].instanceId = A }), /placed twice/],
    ['missing rows', mutated((d) => { delete d.rows }), /rows must be an integer 4\.\.100/],
    ['rows below 4', mutated((d) => { d.rows = 3 }), /rows must be an integer 4\.\.100/],
    ['rows above 100', mutated((d) => { d.rows = 101 }), /rows must be an integer 4\.\.100/],
    ['fractional rows', mutated((d) => { d.rows = 4.5 }), /rows must be an integer 4\.\.100/],
    ['string rows', mutated((d) => { d.rows = '12' }), /rows must be an integer 4\.\.100/],
    ['an out-of-bounds placement', mutated((d) => { d.layout[1].x = 23 }), /inside the 24x100 grid/],
    ['a placement below row 100', mutated((d) => { d.layout[1].y = 99 }), /inside the 24x100 grid/],
    ['a non-integer coordinate', mutated((d) => { d.layout[1].x = 1.5 }), /inside the 24x100 grid/],
    ['a string coordinate', mutated((d) => { d.layout[1].x = '4' }), /inside the 24x100 grid/],
    ['a zero width', mutated((d) => { d.layout[1].w = 0 }), /inside the 24x100 grid/],
    ['overlapping placements', mutated((d) => { d.layout[1] = { instanceId: B, x: 2, y: 2, w: 2, h: 2 } }), /overlaps/],
  ])('rejects %s', (_name, raw, message) => {
    const result = parseScreenBoard(raw)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(message)
  })
})

describe('widget appearance', () => {
  const paper = { palette: 'builtin:lifedashboard', mode: 'light', style: 'solid' } as const
  const look = { theme: paper, shadow: { x: 0, y: 8, blur: 16, color: '#1a2B3c', opacity: 0.5 }, variant: null, scale: null }
  const withLook = (appearance: unknown) => mutated((d) => { d.instances[0].appearance = appearance })
  const first = (raw: unknown) => {
    const result = parseScreenBoard(raw)
    if (!result.ok) throw new Error(result.error)
    return result.value.instances[0]!
  }

  it('parses a stored appearance without variant', () => {
    expect(first(withLook({ themeId: 'builtin:paper', shadow: null })).appearance)
      .toEqual({ theme: paper, shadow: null, variant: null, scale: null })
  })

  it('keeps a variant-only appearance and omits an all-null appearance', () => {
    expect(first(withLook({ themeId: null, shadow: null, variant: 'roman' })).appearance)
      .toEqual({ theme: null, shadow: null, variant: 'roman', scale: null })
    expect(first(withLook({ themeId: null, shadow: null, variant: null }))).not.toHaveProperty('appearance')
  })

  it.each(['Roman', 3])('rejects invalid variant %j', (variant) => {
    expect(parseScreenBoard(withLook({ themeId: null, shadow: null, variant })).ok).toBe(false)
  })

  it.each([-50, 50, 12])('keeps scale %d', (scale) => {
    expect(first(withLook({ theme: 'bare', shadow: null, variant: null, scale })).appearance)
      .toStrictEqual({ theme: 'bare', shadow: null, variant: null, scale })
  })

  it('reads a missing or zero scale as null and keeps the rest', () => {
    const expected = { theme: 'bare', shadow: null, variant: null, scale: null }
    expect(first(withLook({ theme: 'bare', shadow: null, variant: null })).appearance).toStrictEqual(expected)
    expect(first(withLook({ theme: 'bare', shadow: null, variant: null, scale: 0 })).appearance).toStrictEqual(expected)
  })

  it('omits an appearance whose fields are all empty', () => {
    expect(first(withLook({ theme: null, shadow: null, variant: null, scale: 0 }))).not.toHaveProperty('appearance')
    expect(first(withLook({ theme: null, shadow: null, variant: null, scale: null }))).not.toHaveProperty('appearance')
  })

  it('orders scale last', () => {
    expect(Object.keys(first(withLook({ scale: 5, variant: null, shadow: null, theme: 'bare' })).appearance!)).toEqual(['theme', 'shadow', 'variant', 'scale'])
  })

  it('keeps a valid appearance last, in canonical key order, without unknown fields', () => {
    const scrambled = { extra: 1, shadow: { opacity: 0.5, color: '#1a2B3c', extra: 1, blur: 16, y: 8, x: 0 }, themeId: 'builtin:paper' }
    expect(JSON.stringify(first(withLook(scrambled)))).toBe(JSON.stringify({ ...valid.instances[0], appearance: look }))
  })

  it('reads a board without appearance back with the exact same JSON', () => {
    const result = parseScreenBoard(structuredClone(valid))
    expect(result.ok && JSON.stringify(result.value)).toBe(JSON.stringify(valid))
  })

  it.each([
    ['null', null],
    ['all three fields null', { themeId: null, shadow: null, variant: null }],
  ])('omits the appearance key for %s', (_name, appearance) => {
    expect(first(withLook(appearance))).not.toHaveProperty('appearance')
  })

  it.each([['builtin:bare', 'bare'], ['builtin:deleted-1', null], [`user:${A}`, null], [null, null]])('maps legacy widget theme %j', (themeId, theme) => {
    expect(first(withLook({ themeId, shadow: DEFAULT_SHADOW })).appearance).toStrictEqual({ theme, shadow: DEFAULT_SHADOW, variant: null, scale: null })
  })

  it('maps bare and omits an empty legacy appearance', () => {
    expect(first(withLook({ themeId: 'builtin:bare', shadow: null })).appearance?.theme).toBe('bare')
    expect(first(withLook({ themeId: null, shadow: null }))).not.toHaveProperty('appearance')
  })

  it('accepts the shadow bounds', () => {
    for (const shadow of [
      { x: -32, y: -32, blur: 0, color: '#000000', opacity: 0 },
      { x: 32, y: 32, blur: 48, color: '#FFFFFF', opacity: 1 },
    ]) {
      expect(first(withLook({ themeId: null, shadow, variant: null })).appearance).toStrictEqual({ theme: null, shadow, variant: null, scale: null })
    }
  })

  const shadowWith = (change: Record<string, unknown>) => ({ themeId: null, shadow: { ...DEFAULT_SHADOW, ...change } })

  it.each([
    ['a string', 'paper'],
    ['an array', []],
    ['a missing shadow', { themeId: 'builtin:paper' }],
    ['a non-object shadow', { themeId: null, shadow: 'soft' }],
    ['x above 32', shadowWith({ x: 33 })],
    ['y below -32', shadowWith({ y: -33 })],
    ['a fractional x', shadowWith({ x: 1.5 })],
    ['a string y', shadowWith({ y: '8' })],
    ['a negative blur', shadowWith({ blur: -1 })],
    ['blur above 48', shadowWith({ blur: 49 })],
    ['a 3-digit colour', shadowWith({ color: '#fff' })],
    ['a named colour', shadowWith({ color: 'red' })],
    ['a non-hex colour', shadowWith({ color: '#12345g' })],
    ['opacity above 1', shadowWith({ opacity: 1.01 })],
    ['negative opacity', shadowWith({ opacity: -0.1 })],
    ['NaN opacity', shadowWith({ opacity: Number.NaN })],
    ['string opacity', shadowWith({ opacity: '0.5' })],
    ['a missing colour', { themeId: null, shadow: { x: 0, y: 8, blur: 16, opacity: 0.5 } }],
    ['scale above 50', { theme: null, shadow: null, variant: null, scale: 51 }],
    ['scale below -50', { theme: null, shadow: null, variant: null, scale: -51 }],
    ['a fractional scale', { theme: null, shadow: null, variant: null, scale: 1.5 }],
    ['a string scale', { theme: null, shadow: null, variant: null, scale: '10' }],
  ])('rejects %s', (_name, appearance) => {
    const result = parseScreenBoard(withLook(appearance))
    expect(result).toEqual({ ok: false, error: 'instances[0]: invalid widget appearance' })
  })

  it('rejects an invalid font slug in an instance appearance', () => {
    const theme = { palette: 'builtin:gruvbox', mode: 'dark', style: 'solid', body: 'Inter' }
    expect(parseScreenBoard(withLook({ theme, shadow: null }))).toEqual({ ok: false, error: 'instances[0]: invalid widget appearance' })
  })
})

describe('normalizeAppearance', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['all four fields null', { theme: null, shadow: null, variant: null, scale: null }],
    ['all four fields empty', { theme: null, shadow: null, variant: null, scale: 0 }],
  ])('returns undefined for %s', (_name, appearance) => {
    expect(normalizeAppearance(appearance)).toBeUndefined()
  })

  it('rebuilds the canonical key order', () => {
    const scrambled = { shadow: { opacity: 0.5, color: '#000000', blur: 16, y: 8, x: 0 }, theme: null, variant: null, scale: null }
    expect(JSON.stringify(normalizeAppearance(scrambled))).toBe(JSON.stringify({ theme: null, shadow: DEFAULT_SHADOW, variant: null, scale: null }))
  })
})
