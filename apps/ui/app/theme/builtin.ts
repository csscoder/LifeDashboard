import type { ThemeChoice, ThemeStyle } from '@lifedashboard/contracts/theme'
import type { ColorScheme } from './contract'
import { BUILTIN_PALETTE_IDS } from './palettes'

export const DEFAULT_THEME: ThemeChoice = { palette: 'builtin:lifedashboard', mode: 'dark', style: 'glass' }

/** The CSS combination key, with an automatic mode resolved against the system scheme. */
export function themeKey(choice: ThemeChoice, scheme: ColorScheme): string {
  return `${choice.palette.slice('builtin:'.length)}-${choice.mode === 'auto' ? scheme : choice.mode}-${choice.style}`
}

/** Parse from the right so palette slugs may themselves contain hyphens. */
export function themeMeta(id: string): { id: string; mode: ColorScheme; skin: ThemeStyle } {
  const parts = id.split('-')
  const skin = parts.pop()
  const mode = parts.pop()
  if ((skin === 'solid' || skin === 'glass') && (mode === 'light' || mode === 'dark') && BUILTIN_PALETTE_IDS.has(parts.join('-'))) {
    return { id, mode, skin }
  }
  return { id: `builtin:${themeKey(DEFAULT_THEME, 'dark')}`, mode: 'dark', skin: 'glass' }
}
