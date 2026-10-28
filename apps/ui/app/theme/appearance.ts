import { isThemeChoice, legacyTheme, type ThemeChoice } from '@lifedashboard/contracts/theme'

export const APPEARANCE_STORAGE_KEY = 'lifedashboard.appearance'

// Workspace appearance until settings move to SQLite (E1).
export interface Appearance {
  schemaVersion: 2
  theme: ThemeChoice | null
}

/** Never throws: missing, malformed or unreadable data yields the defaults. */
export function loadAppearance(): Appearance {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY) ?? 'null')
    if (typeof raw === 'object' && raw !== null && !Array.isArray(raw) && 'schemaVersion' in raw) {
      if (raw.schemaVersion === 2 && 'theme' in raw && (raw.theme === null || isThemeChoice(raw.theme))) {
        return { schemaVersion: 2, theme: raw.theme }
      }
      if (raw.schemaVersion === 1 && 'themeId' in raw && (raw.themeId === null || typeof raw.themeId === 'string')) {
        const theme = legacyTheme(raw.themeId)
        return { schemaVersion: 2, theme: theme === 'bare' ? null : theme }
      }
    }
  } catch {
    // Unreadable storage or malformed JSON: fall through to the defaults.
  }
  return { schemaVersion: 2, theme: null }
}

/** Never throws; false means the choice stays applied in memory only. */
export function saveAppearance(appearance: Appearance): boolean {
  try {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(appearance))
    return true
  } catch {
    return false
  }
}
