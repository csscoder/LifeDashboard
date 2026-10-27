import { describe, expect, it } from 'vitest'
import { SPACE_ICONS, nextColor, parseSpacePatch, type SpaceColor } from '../src/space.ts'

describe('parseSpacePatch', () => {
  it.each(['   ', '\u0085', 'a\u200bb', 'a\u200eb', 'a\u202eb', 'a\u2066b', 'a\u2028b', 'a\u0000b', 'a\tb', 'a\nb', 'a\u001fb', 'a\u007fb'])('rejects blank, control or hidden title %j', (title) => {
    expect(parseSpacePatch({ title }).ok).toBe(false)
  })

  it.each(['Weather', 'Météo de Paris', '\u{1F468}\u200d\u{1F469}\u200d\u{1F467}', 'می\u200cخواهم'])('accepts readable international title %j', (title) => {
    expect(parseSpacePatch({ title })).toEqual({ ok: true, value: { title } })
  })

  it('trims the title', () => {
    expect(parseSpacePatch({ title: '  Home  ' })).toEqual({ ok: true, value: { title: 'Home' } })
  })

  it('accepts a known icon and colour', () => {
    expect(parseSpacePatch({ icon: '⭐', color: 'pink' })).toEqual({ ok: true, value: { icon: '⭐', color: 'pink' } })
  })

  it.each([null, 'builtin:paper', 'builtin:future-theme', 'user:00000000-0000-4000-8000-00000000000a'])('accepts theme assignment %j', (themeId) => {
    expect(parseSpacePatch({ themeId })).toEqual({ ok: true, value: { themeId } })
  })

  it.each(['builtin:bare', 'paper', 'builtin:', 'user:invalid', 7, {}])('rejects invalid space theme %j', (themeId) => {
    expect(parseSpacePatch({ themeId })).toEqual({ ok: false, error: 'invalid space themeId' })
  })

  it.each([
    ['an empty patch', {}],
    ['a blank title', { title: '   ' }],
    ['a title over 40 characters', { title: 'x'.repeat(41) }],
    ['an icon outside the list', { icon: '🦄' }],
    ['an unknown colour', { color: 'black' }],
    ['an unknown key', { extra: 1 }],
    ['a non-object', 'Home'],
  ])('rejects %s', (_name, raw) => {
    expect(parseSpacePatch(raw).ok).toBe(false)
  })

  it('counts the title length in code points', () => {
    expect(parseSpacePatch({ title: '😀'.repeat(40) }).ok).toBe(true)
    expect(parseSpacePatch({ title: '😀'.repeat(41) }).ok).toBe(false)
  })
})

describe('space icons', () => {
  it('lists 24 distinct icons', () => {
    expect(SPACE_ICONS.length).toBe(24)
    expect(new Set(SPACE_ICONS).size).toBe(24)
  })
})

describe('nextColor', () => {
  it('takes the first free colour', () => {
    expect(nextColor([])).toBe('violet')
    expect(nextColor(['violet', 'blue'])).toBe('teal')
  })

  it('wraps around once all eight colours are used', () => {
    const all: SpaceColor[] = ['violet', 'blue', 'teal', 'green', 'amber', 'orange', 'red', 'pink']
    expect(nextColor(all)).toBe('violet')
    expect(nextColor([...all, 'violet'])).toBe('blue')
  })
})
