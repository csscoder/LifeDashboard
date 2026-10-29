import type { WidgetAppearance } from '@lifedashboard/contracts/board'
import type { ThemeChoice, ThemeStyle } from '@lifedashboard/contracts/theme'
import { DEFAULT_THEME, themeKey, themeMeta } from './builtin'
import type { ColorScheme } from './contract'
import { fontVars } from './fonts'
import { BUILTIN_PALETTE_IDS } from './palettes'

export type FrameSkin = ThemeStyle | 'bare'

/** Unknown palettes count as unset without rewriting the stored choice. */
export function resolveTheme(chain: readonly (ThemeChoice | null | undefined)[], scheme: ColorScheme): string {
  const choice = chain.find((choice): choice is ThemeChoice => choice != null && BUILTIN_PALETTE_IDS.has(choice.palette)) ?? DEFAULT_THEME
  return `builtin:${themeKey(choice, scheme)}`
}

/** Bare and inherited widgets retain the board's resolved tokens and fonts; an own palette brings only its own fonts. */
export function resolveWidgetLook(
  appearance: WidgetAppearance | undefined,
  boardThemeId: string,
  scheme: ColorScheme,
  boardChoice: ThemeChoice,
): { themeId: string; skin: FrameSkin; foreign: boolean; fonts: Record<string, string> } {
  const boardFonts = fontVars(boardChoice)
  if (appearance?.theme === 'bare') return { themeId: boardThemeId, skin: 'bare', foreign: false, fonts: boardFonts }
  const choice = appearance?.theme
  const own = choice && BUILTIN_PALETTE_IDS.has(choice.palette) ? choice : null
  const themeId = own ? resolveTheme([own], scheme) : boardThemeId
  return { themeId, skin: themeMeta(themeId).skin, foreign: themeId !== boardThemeId, fonts: own ? fontVars(own) : boardFonts }
}

/** CSS class suffix: builtin:<name> → <name>, user:<uuid> → u-<uuid>. */
export function themeClass(id: string): string {
  if (id.startsWith('builtin:')) return id.slice('builtin:'.length)
  if (id.startsWith('user:')) return `u-${id.slice('user:'.length)}`
  throw new Error(`Unknown theme id format: ${id}`)
}
