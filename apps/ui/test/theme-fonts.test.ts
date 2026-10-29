import { readdirSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'
import { BUILTIN_FONTS, fontStack, fontVars, withFont } from '../app/theme/fonts'
import { allThemeCombos, themeRule } from '../app/theme/generate'
import { validateThemeCss } from '../app/theme/validate-theme'

const base = { palette: 'builtin:gruvbox', mode: 'dark', style: 'solid' } as const
const filesDir = new URL('../app/theme/fonts/', import.meta.url)
const faces = postcss.parse(readFileSync(new URL('../app/theme/styles/fonts.css', import.meta.url), 'utf8'))
  .nodes.filter((node): node is postcss.AtRule => node.type === 'atrule' && node.name === 'font-face')
const decl = (rule: postcss.AtRule, prop: string) => {
  let found: string | undefined
  rule.walkDecls(prop, (d) => { found = d.value })
  return found
}
const inter = BUILTIN_FONTS.find((font) => font.slug === 'inter')!

describe('font files', () => {
  it('ships both subsets and the licence of every family, and nothing else', () => {
    const expected = BUILTIN_FONTS.flatMap((font) => [`${font.slug}-latin.woff2`, `${font.slug}-cyrillic.woff2`, `${font.slug}.OFL.txt`])
    expect(readdirSync(filesDir).sort()).toEqual(expected.sort())
  })

  it('declares one @font-face per file', () => {
    expect(faces).toHaveLength(BUILTIN_FONTS.length * 2)
    const expected = BUILTIN_FONTS.flatMap((font) => ['latin', 'cyrillic'].map((subset) => ({
      family: `'${font.name}'`, weight: `${font.weight[0]} ${font.weight[1]}`, src: `url(../fonts/${font.slug}-${subset}.woff2) format('woff2')`,
    })))
    expect(faces.map((rule) => ({ family: decl(rule, 'font-family'), weight: decl(rule, 'font-weight'), src: decl(rule, 'src') }))).toEqual(expected)
    for (const rule of faces) {
      expect(decl(rule, 'font-display')).toBe('swap')
      expect(decl(rule, 'unicode-range')).toMatch(/^U\+/)
    }
  })
})

describe('font stacks', () => {
  it('formats the family with system-ui and its generic fallback', () => {
    expect(fontStack(inter)).toBe("'Inter', system-ui, sans-serif")
  })

  it.each(BUILTIN_FONTS.map((font) => [font.slug, font] as const))('%s stack passes the theme contract', (_, font) => {
    const combo = allThemeCombos()[0]!
    const css = themeRule(combo)
      .replace(/--ld-font-body:[^;]+;/, `--ld-font-body: ${fontStack(font)};`)
      .replace(/--ld-font-heading:[^;]+;/, `--ld-font-heading: ${fontStack(font)};`)
    expect(css).toContain(fontStack(font))
    expect(validateThemeCss(css, { slug: combo.key, mode: combo.mode })).toEqual({ ok: true })
  })
})

describe('fontVars', () => {
  it('maps known slugs to the four variables', () => {
    const unbounded = BUILTIN_FONTS.find((font) => font.slug === 'unbounded')!
    expect(fontVars({ ...base, heading: 'unbounded', body: 'inter' })).toEqual({
      '--ld-font-heading': fontStack(unbounded), '--ld-font-display': fontStack(unbounded),
      '--ld-font-body': fontStack(inter), '--ld-font-ui': fontStack(inter),
    })
  })

  it('ignores unknown slugs and missing choices', () => {
    expect(fontVars({ ...base, heading: 'comic' })).toEqual({})
    expect(fontVars(null)).toEqual({})
    expect(fontVars(undefined)).toEqual({})
  })
})

describe('withFont', () => {
  it('keeps the canonical key order', () => {
    expect(Object.keys(withFont({ ...base, body: 'inter' }, 'heading', 'lora'))).toEqual(['palette', 'mode', 'style', 'heading', 'body'])
  })

  it('removes a key for null', () => {
    expect(withFont({ ...base, body: 'inter' }, 'body', null)).toEqual(base)
  })
})
