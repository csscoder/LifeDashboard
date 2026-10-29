import type { ThemeChoice } from '@lifedashboard/contracts/theme'

export interface FontFamily {
  slug: string
  name: string
  fallback: 'sans-serif' | 'serif'
  /** The family's wght axis range. */
  weight: [min: number, max: number]
}

// Weight ranges: https://fonts.google.com/metadata/fonts, checked 2026-10-29.
// Imported by scripts/fetch-fonts.ts under Node, so relative imports here need `.ts` specifiers.
export const BUILTIN_FONTS: readonly FontFamily[] = [
  { slug: 'inter', name: 'Inter', fallback: 'sans-serif', weight: [100, 900] },
  { slug: 'golos-text', name: 'Golos Text', fallback: 'sans-serif', weight: [400, 900] },
  { slug: 'onest', name: 'Onest', fallback: 'sans-serif', weight: [100, 900] },
  { slug: 'manrope', name: 'Manrope', fallback: 'sans-serif', weight: [200, 800] },
  { slug: 'montserrat', name: 'Montserrat', fallback: 'sans-serif', weight: [100, 900] },
  { slug: 'nunito', name: 'Nunito', fallback: 'sans-serif', weight: [200, 1000] },
  { slug: 'rubik', name: 'Rubik', fallback: 'sans-serif', weight: [300, 900] },
  { slug: 'unbounded', name: 'Unbounded', fallback: 'sans-serif', weight: [200, 900] },
  { slug: 'lora', name: 'Lora', fallback: 'serif', weight: [400, 700] },
  { slug: 'literata', name: 'Literata', fallback: 'serif', weight: [200, 900] },
  { slug: 'playfair-display', name: 'Playfair Display', fallback: 'serif', weight: [400, 900] },
  { slug: 'eb-garamond', name: 'EB Garamond', fallback: 'serif', weight: [400, 800] },
]
export const BUILTIN_FONT_SLUGS: ReadonlySet<string> = new Set(BUILTIN_FONTS.map((font) => font.slug))

export function fontStack(font: FontFamily): string {
  return `'${font.name}', system-ui, ${font.fallback}`
}

const bySlug = (slug: string | undefined) => BUILTIN_FONTS.find((font) => font.slug === slug)

/** Unknown or absent slugs yield no entry, so the theme default shows through. */
export function fontVars(choice: ThemeChoice | null | undefined): Record<string, string> {
  const heading = bySlug(choice?.heading)
  const body = bySlug(choice?.body)
  return {
    ...(heading && { '--ld-font-heading': fontStack(heading), '--ld-font-display': fontStack(heading) }),
    ...(body && { '--ld-font-body': fontStack(body), '--ld-font-ui': fontStack(body) }),
  }
}

/** `null` removes the key; the result keeps the canonical key order. */
export function withFont(choice: ThemeChoice, key: 'heading' | 'body', slug: string | null): ThemeChoice {
  const next = { ...choice, [key]: slug ?? undefined }
  const { palette, mode, style, heading, body } = next
  return { palette, mode, style, ...(heading !== undefined && { heading }), ...(body !== undefined && { body }) }
}
