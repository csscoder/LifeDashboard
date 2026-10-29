import type { DropShadow, WidgetAppearance } from '@lifedashboard/contracts/board'
import type { ThemeChoice } from '@lifedashboard/contracts/theme'

/** A new «Style»; the shadow stays. */
export function withStyle(appearance: WidgetAppearance | undefined, theme: ThemeChoice | 'bare' | null): WidgetAppearance {
  return { theme, shadow: appearance?.shadow ?? null, variant: appearance?.variant ?? null, scale: null }
}

/** A new shadow (null: the theme's own); the stored theme choice stays, including an unavailable palette. */
export function withShadow(appearance: WidgetAppearance | undefined, shadow: DropShadow | null): WidgetAppearance {
  return { theme: appearance?.theme ?? null, shadow, variant: appearance?.variant ?? null, scale: null }
}

/** A new widget look; the theme and shadow stay. */
export function withVariant(appearance: WidgetAppearance | undefined, variant: string | null): WidgetAppearance {
  return { theme: appearance?.theme ?? null, shadow: appearance?.shadow ?? null, variant, scale: null }
}

/**
 * Top-left of a fixed panel beside the widget: to its right, else to its left, `margin` inside the viewport.
 * CSS anchor positioning is not in every browser (spec «Decisions»).
 */
export function panelPosition(
  anchor: { left: number; top: number; right: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  margin = 8,
): { left: number; top: number } {
  const right = anchor.right + margin
  const left = right + size.width + margin <= viewport.width ? right : anchor.left - margin - size.width
  const clamp = (value: number, length: number, room: number) => Math.max(margin, Math.min(value, room - length - margin))
  return { left: clamp(left, size.width, viewport.width), top: clamp(anchor.top, size.height, viewport.height) }
}
