import type { ThemeStyle } from '@lifedashboard/contracts/theme'
import { composite, contrastRatio, formatOklch, hexToOklch, parseColor, toRgba, type Oklch } from './color.ts'
import { STATUSES, type ColorScheme } from './contract.ts'
import { BUILTIN_PALETTES, type Palette } from './palettes.ts'

const color = (value: string): Oklch => {
  const parsed = value.startsWith('#') ? hexToOklch(value) : parseColor(value)
  if (!parsed) throw new Error(`Invalid palette colour: ${value}`)
  return parsed
}
const shift = (value: Oklch, delta: number): Oklch => ({ ...value, l: Math.max(0, Math.min(1, value.l + delta)) })

/** Pure palette × mode × style expansion, with rounded colours used in every contrast check. */
export function buildTokens(palette: Palette, scheme: ColorScheme, style: ThemeStyle): Record<string, string> {
  const seed = palette[scheme]
  const dark = scheme === 'dark'
  const glass = style === 'glass'
  const tokens: Record<string, string> = {}
  const put = (name: string, value: string) => {
    tokens[`--ld-${name}`] = value
  }
  const paint = (name: string, value: Oklch) => put(name, formatOklch(value))
  const rgba = (name: string) => toRgba(color(tokens[`--ld-${name}`]!))
  const bg = color(seed.bg)
  const primary = color(seed.text[0])
  const accent = color(seed.accent)
  paint('bg', bg)
  const backdropStop = color(formatOklch({ ...accent, l: dark ? 0.38 : 0.92, c: accent.c * 0.5 }))
  put('backdrop', glass
    ? `radial-gradient(circle at 20% 10%, ${formatOklch(backdropStop)}, ${formatOklch(bg)} 60%)`
    : formatOklch(bg))
  paint('scrim', { l: 0, c: 0, h: 0, alpha: dark ? 0.5 : 0.35 })
  paint('surface-1', glass ? { l: 1, c: 0, h: 0, alpha: dark ? 0.08 : 0.55 } : color(seed.surface[0]))
  paint('surface-1-solid', color(seed.surface[0]))
  paint('surface-2', color(seed.surface[1]))
  paint('surface-3', color(seed.surface[2]))
  for (const [index, name] of ['primary', 'secondary', 'muted', 'disabled'].entries()) paint(`text-${name}`, color(seed.text[index]!))
  for (const [name, alpha] of [['hover', 0.06], ['active', 0.1], ['selected', 0.14]] as const) paint(`state-${name}`, { ...primary, alpha })
  for (const [name, alpha] of [['subtle', 0.45], ['default', 0.7], ['strong', 1]] as const) paint(`border-${name}`, { ...color(seed.border), alpha })
  put('border-width', '0.0625rem')

  const backgrounds = [
    rgba('surface-1-solid'),
    composite(rgba('surface-1'), rgba('bg')),
    ...(glass ? [composite(rgba('surface-1'), toRgba(backdropStop))] : []),
    rgba('surface-2'), rgba('surface-3'),
  ]
  for (const name of ['accent', ...STATUSES] as const) {
    const fill = color(seed[name])
    paint(name, fill)
    paint(`${name}-subtle`, { ...fill, alpha: dark ? 0.12 : 0.16 })
    const bases = [...backgrounds, ...backgrounds.map((base) => composite(rgba(`${name}-subtle`), base))]
    // Search the seed's lightness direction toward primary text, keeping hue/chroma.
    // Check the emitted (rounded) colour with a margin above the contract's 4.5:1.
    const direction = Math.sign(primary.l - fill.l)
    let found = false
    for (let step = 0; step <= 50; step++) {
      const candidate = shift(fill, direction * step * 0.01)
      const literal = formatOklch(candidate)
      if (bases.every((base) => contrastRatio(toRgba(color(literal)), base) >= 4.6)) {
        put(`${name}-text`, literal)
        found = true
        break
      }
    }
    if (!found) throw new Error(`${palette.slug} ${scheme} ${style}: no ${name}-text passes 4.5:1`)
    put(`on-${name}`, contrastRatio(rgba('bg'), rgba(name)) > contrastRatio(rgba('text-primary'), rgba(name))
      ? tokens['--ld-bg']! : tokens['--ld-text-primary']!)
  }
  paint('accent-hover', shift(accent, dark ? 0.05 : -0.05))
  paint('accent-active', shift(accent, dark ? -0.05 : 0.05))
  put('focus-ring', tokens['--ld-accent-text']!)
  put('link', tokens['--ld-accent-text']!)
  for (const [name, value] of Object.entries({
    'radius-widget': glass ? '1rem' : '0.75rem', 'radius-card': glass ? '0.75rem' : '0.5rem',
    'radius-control': glass ? '0.5rem' : '0.375rem', 'radius-pill': '999px',
    'font-ui': 'system-ui, sans-serif', 'font-mono': 'ui-monospace, monospace',
    'font-display': 'system-ui, sans-serif', 'font-heading': 'system-ui, sans-serif', 'font-body': 'system-ui, sans-serif',
    'font-scale': '1', 'size-h1': '2em', 'size-h2': '1.5em', 'size-h3': '1.25em', 'size-body': '1em', 'size-small': '0.875em',
    'leading-heading': '1.2', 'weight-regular': '400', 'weight-medium': '500', 'weight-strong': '600',
    leading: '1.5', tracking: '0em', 'duration-fast': '120ms', 'duration-base': '200ms', 'duration-slow': '320ms',
    'ease-standard': 'cubic-bezier(0.2, 0, 0, 1)', 'ease-emphasized': 'cubic-bezier(0.3, 0, 0, 1.2)',
    'widget-padding': '0.75rem', gap: '0.75rem', 'control-height': '2.25rem',
    'shadow-widget': glass ? '0 0.5rem 2rem oklch(0 0 0 / 0.3)' : `0 0.125rem 0.5rem oklch(0 0 0 / ${dark ? 0.3 : 0.12})`,
    'shadow-raised': glass ? '0 0.25rem 0.75rem oklch(0 0 0 / 0.3)' : `0 0.125rem 0.375rem oklch(0 0 0 / ${dark ? 0.3 : 0.12})`,
  })) put(name, value)
  if (glass) {
    put('blur', '1rem')
    put('edge-highlight', '0.18')
  }
  return tokens
}

export interface ThemeCombo {
  key: string
  id: string
  name: string
  mode: ColorScheme
  style: ThemeStyle
  tokens: Record<string, string>
}

export function allThemeCombos(): ThemeCombo[] {
  return BUILTIN_PALETTES.flatMap((palette) => (['dark', 'light'] as const).flatMap((mode) =>
    (['glass', 'solid'] as const).map((style) => {
      const key = `${palette.slug}-${mode}-${style}`
      return { key, id: `builtin:${key}`, name: `${palette.name} ${mode === 'dark' ? 'Dark' : 'Light'} ${style === 'glass' ? 'Glass' : 'Solid'}`, mode, style, tokens: buildTokens(palette, mode, style) }
    })))
}

export function themeRule(combo: ThemeCombo): string {
  return `.space--theme-${combo.key}, .widget--theme-${combo.key} {\n  color-scheme: ${combo.mode};\n${Object.entries(combo.tokens).map(([name, value]) => `  ${name}: ${value};`).join('\n')}\n}`
}

export function generateThemesCss(): string {
  return `/* Generated by pnpm -C apps/ui gen:themes. Do not edit. */\n\n${allThemeCombos().map(themeRule).join('\n\n')}\n`
}
