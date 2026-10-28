import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { allThemeCombos, buildTokens, generateThemesCss, themeRule } from '../app/theme/generate'
import { composite, contrastRatio, parseColor, toRgba } from '../app/theme/color'
import { BUILTIN_PALETTES } from '../app/theme/palettes'
import { validateThemeCss } from '../app/theme/validate-theme'

const combos = allThemeCombos()

describe('theme generation', () => {
  it('has 44 combinations in the fixed order', () => {
    expect(combos).toHaveLength(44)
    expect(combos[0]!.id).toBe('builtin:lifedashboard-dark-glass')
    expect(combos[3]!.id).toBe('builtin:lifedashboard-light-solid')
    expect(combos.map((combo) => combo.key)).toEqual([
      'lifedashboard', 'catppuccin', 'gruvbox', 'github', 'solarized', 'tokyo-night',
      'rose-pine', 'everforest', 'one', 'kanagawa', 'ayu',
    ].flatMap((slug) => ['dark-glass', 'dark-solid', 'light-glass', 'light-solid'].map((suffix) => `${slug}-${suffix}`)))
  })

  it.each(combos.map((c) => [c.key, c] as const))('%s passes the contract', (_, combo) => {
    expect(validateThemeCss(themeRule(combo), { slug: combo.key, mode: combo.mode })).toEqual({ ok: true })
  })

  it.each(combos.map((c) => [c.key, c] as const))('%s keeps the text-search margin on every surface and subtle overlay', (_, combo) => {
    const rgba = (name: string) => toRgba(parseColor(combo.tokens[`--ld-${name}`]!)!)
    const stops = combo.tokens['--ld-backdrop']!.match(/oklch\([^)]*\)/g)!
    const backgrounds = [
      rgba('surface-1-solid'), rgba('surface-2'), rgba('surface-3'),
      ...[rgba('bg'), ...stops.map((stop) => toRgba(parseColor(stop)!))]
        .map((base) => composite(rgba('surface-1'), base)),
    ]
    for (const name of ['accent', 'success', 'warning', 'danger', 'info']) {
      for (const base of backgrounds) {
        expect(contrastRatio(rgba(`${name}-text`), base)).toBeGreaterThanOrEqual(4.6)
        expect(contrastRatio(rgba(`${name}-text`), composite(rgba(`${name}-subtle`), base))).toBeGreaterThanOrEqual(4.6)
      }
    }
  })

  it('keeps generated.css in sync', () => {
    expect(readFileSync(new URL('../app/theme/styles/themes/generated.css', import.meta.url), 'utf8')).toBe(generateThemesCss())
  })

  it('applies the style rules', () => {
    const ld = BUILTIN_PALETTES[0]!
    expect(buildTokens(ld, 'dark', 'glass')['--ld-surface-1']).toBe('oklch(1 0 0 / 0.08)')
    expect(buildTokens(ld, 'light', 'glass')['--ld-surface-1']).toBe('oklch(1 0 0 / 0.55)')
    expect(buildTokens(ld, 'dark', 'solid')['--ld-blur']).toBeUndefined()
    expect(buildTokens(ld, 'dark', 'glass')['--ld-radius-widget']).toBe('1rem')
    expect(buildTokens(ld, 'dark', 'solid')['--ld-radius-widget']).toBe('0.75rem')
    expect(buildTokens(ld, 'dark', 'solid')['--ld-link']).toBe(buildTokens(ld, 'dark', 'solid')['--ld-accent-text'])
  })

  it('throws with palette, mode, style and token when no text colour passes', () => {
    const bad = { ...BUILTIN_PALETTES[0]!, slug: 'bad', dark: { ...BUILTIN_PALETTES[0]!.dark, surface: ['#808080', '#808080', '#808080'] as [string, string, string], bg: '#808080', text: ['#808080', '#808080', '#808080', '#808080'] as [string, string, string, string] } }
    expect(() => buildTokens(bad, 'dark', 'solid')).toThrow(/bad dark solid: .*-text/)
  })
})
