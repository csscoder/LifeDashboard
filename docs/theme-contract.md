# Theme contract (version 2)

The rules a LifeDashboard theme must satisfy. `apps/ui/app/theme/contract.ts` is the canonical
token list; `validateThemeCss()` in `apps/ui/app/theme/validate-theme.ts` enforces this document for the built-in themes in the test suite; a runtime check for user themes comes with user themes.
Design: [archived theme-engine design](../.project-history/features/2026-10-09-theme-engine/spec.md).

## Assignment and inheritance

A choice is `{ palette, mode, style }`: one of 11 built-in palette IDs (for example `builtin:lifedashboard`), `light`, `dark` or `auto`, and `solid` or `glass`. Auto follows the system colour scheme; the two resolved modes produce 44 combinations. Resolution is widget → screen → space → dashboard default → LifeDashboard Dark Glass. Null inherits. A widget may use `'bare'` to remove its frame while keeping inherited screen tokens; spaces and screens cannot use bare.

Space and screen assignments persist in SQLite; the dashboard default uses browser appearance storage schema version 2. Legacy theme IDs migrate to LifeDashboard combinations. Screen choices preview in the board draft and follow Done/Cancel. Importing user palettes is planned.

## Generator

Palette seeds live in `apps/ui/app/theme/palettes.ts`; `apps/ui/app/theme/generate.ts` converts them to token sets. Run `pnpm -C apps/ui gen:themes` to regenerate `apps/ui/app/theme/styles/themes/generated.css`. This generated file must not be edited by hand. It contains 44 combination rules, each validated for syntax, token ranges, opacity and contrast. The generator reports failures rather than silently changing palette seeds.

## Screen media backgrounds

`ScreenBoard.background` stores a generic `mediaId`, `kind` (`video` or `image`), opacity, dimming and a PNG-pattern configuration. The background is independent of theme tokens; theme backdrop remains underneath and becomes visible as media opacity decreases or the renderer falls back. Legacy `videoId` documents normalize to video backgrounds, and an additive migration preserves references/files.

The existing screen settings popover handles import and draft adjustments. Local files are copied into application-owned storage and served through authenticated, range-capable media routes. Saved references and renewable leases protect current drafts/playback from cleanup; Cancel/replacement releases unused imports. Originals remain untouched.

A selected binary-alpha PNG repeats at its native cell size: diagonal 2×2 px, squares/crosses/triangles/diamonds 3×3 px, circles 6×6 px. The default is diagonal at scale 1. The UI offers integer enlargement from 1× to 4× and a grid on/off switch. The renderer rounds legacy fractional scale to an integer with minimum 1, uses nearest sampling and disables pattern mipmaps. Pattern colour/opacity, media opacity and uniform dimming are independent. Background video is muted/looped and pauses when hidden; static images have no playback loop. Unsupported browser codecs or renderer errors retain a usable theme fallback. This is not automatic contrast analysis or transcoding.

## Format

The generator returns a combination `{ key, id, name, mode, style, tokens }`. `themeRule()` serializes its token set to CSS; SDK development entries expose `skin` equal to `style`.

- `mode`: `light` or `dark`.
- `style`: one of the built-in skins `glass`, `solid`. Skins hold all structure and effects;
  a theme only tunes them through tokens.
- Each combination serializes to exactly **one rule**:

```css
.space--theme-<slug>, .widget--theme-<slug> {
  color-scheme: dark;
  --ld-bg: oklch(0.2 0.02 280);
  /* … every required token, optional tokens if wanted */
}
```

The built-in slug is `<palette>-<mode>-<style>`, with id `builtin:<palette>-<mode>-<style>`. No other selector,
rule or at-rule (`@import`, `@media`, `@font-face`, `@keyframes`, …) and no property other than
`color-scheme` and contract tokens. `url(`, `image-set(`, `attr(`, `expression` and `!important`
are rejected anywhere.

Generated combinations: `apps/ui/app/theme/styles/themes/generated.css`.

## Values

- **Colour tokens:** `oklch(L C H [/ A])`, `var(--ld-<colour token>)` from the same block, or
  `transparent`. No hex, `rgb()`, `hsl()` or named colours. Cycles are rejected.
- **Opaque (alpha 1):** `bg`, `surface-1-solid`, `surface-2`, `surface-3`, all `text-*`,
  `accent`, `accent-hover`, `accent-active`, `accent-text`, `on-accent`, `link`, `focus-ring`, and for each
  status `<s>`, `<s>-text`, `on-<s>`. Only `surface-1` may be translucent.
- `surface-1-solid` must be an `oklch()` literal (not `var()`).
- **Font stacks:** family names in double or single quotes containing only `[A-Za-z0-9 _-]+`
  (ASCII letters, digits, spaces, underscores and hyphens), and generic families (`system-ui`, `ui-monospace`,
  `ui-serif`, `ui-rounded`, `sans-serif`, `serif`, `monospace`, …) only.

## Required tokens

| Token | Type | Allowed values |
| --- | --- | --- |
| `bg` | colour | Opaque page colour |
| `backdrop` | colour or gradient | Colour, or `linear-gradient()` / `radial-gradient()` with ≥ 2 colour stops |
| `scrim` | colour | Overlay behind dialogs |
| `surface-1` | colour | Widget box; may be translucent |
| `surface-1-solid` | colour | Opaque `oklch()` replacement for `surface-1` |
| `surface-2`, `surface-3` | colour | Cards, controls; opaque |
| `state-hover`, `state-active`, `state-selected` | colour | Translucent overlays |
| `text-primary`, `text-secondary`, `text-muted`, `text-disabled` | colour | Opaque |
| `border-subtle`, `border-default`, `border-strong` | colour | |
| `border-width` | length | 0–0.125rem |
| `accent`, `accent-hover`, `accent-active` | colour | Opaque fills |
| `accent-subtle` | colour | Tinted background |
| `accent-text`, `on-accent` | colour | Opaque |
| `<s>`, `<s>-subtle`, `<s>-text`, `on-<s>` for `success`, `warning`, `danger`, `info` | colour | `<s>`, `<s>-text`, `on-<s>` opaque |
| `focus-ring` | colour | Opaque |
| `radius-widget`, `radius-card`, `radius-control` | length | 0–2rem |
| `radius-pill` | length | 0–999px |
| `font-ui`, `font-mono`, `font-display` | font stack | See Values |
| `font-heading`, `font-body` | font stack | `system-ui, sans-serif` generated; same validation as other font stacks |
| `size-h1`, `size-h2`, `size-h3`, `size-body`, `size-small` | length, `em` | 0.75–3em, strictly descending; generated 2em, 1.5em, 1.25em, 1em, 0.875em |
| `leading-heading` | number | 1.0–1.6; generated 1.2 |
| `link` | colour | Opaque; generated equal to `accent-text` |
| `font-scale` | number | 0.875–1.25 |
| `weight-regular`, `weight-medium`, `weight-strong` | number | 300–800, strictly ascending |
| `leading` | number | 1.2–1.8 |
| `tracking` | length | -0.02em–0.05em |
| `duration-fast`, `duration-base`, `duration-slow` | time | 0–600ms |
| `ease-standard`, `ease-emphasized` | easing | `cubic-bezier()` or `linear`, `ease`, `ease-in`, `ease-out`, `ease-in-out` |
| `widget-padding`, `gap` | length | 0.25rem–1.5rem |
| `control-height` | length | 1.75rem–2.75rem |

The generator sets `font-ui` equal to `font-body` and `font-display` equal to `font-heading`; both legacy font tokens remain required. Content uses semantic typography and `em` sizes.

## Optional tokens

| Token | Type | Allowed values | When omitted |
| --- | --- | --- | --- |
| `shadow-widget`, `shadow-raised` | shadow | `none` or up to 3 outer shadows; rem lengths ≤ 3rem; one colour each; no `inset` | `none` |
| `blur` | length | 0–2rem (backdrop blur of the frame) | `0` |
| `glow` | colour | | `transparent` |
| `edge-highlight` | number | 0–0.4 (alpha of a 1px line at the top edge) | `0` |

## Fonts

A theme choice may carry two optional keys, `heading` and `body`: slugs matching `^[a-z][a-z0-9-]{0,31}$`.
An absent key means the theme's default font (`system-ui`); `null` is invalid. A valid slug the catalog
does not know (a family removed later) is stored unchanged and renders the theme default.

The catalog is `apps/ui/app/theme/fonts.ts`: 12 Google Fonts families, Latin and Cyrillic subsets, upright
only. `pnpm -C apps/ui fetch:fonts` downloads the WOFF2 files and `OFL.txt` licences into
`apps/ui/app/theme/fonts/` and generates `apps/ui/app/theme/styles/fonts.css`; all of it is committed, and
normal builds never touch the network.

The host applies a font as inline custom properties, not as a class: `heading` sets `--ld-font-heading` and
`--ld-font-display`, `body` sets `--ld-font-body` and `--ld-font-ui`, each to `'<Name>', system-ui, <fallback>`.
They sit on the `.space` root and on each widget frame root, and win over the theme rule on the same element.
A widget with its own palette uses its own fonts only; one without inherits the board's. Sandboxed widgets
receive the values through `context.theme.tokens`, and the SDK runtime loads the files from
`/sandbox/runtime/fonts/`. Fonts never change the combination id.

## Contrast (WCAG 2)

The validator composites in paint order (backdrop → surface → overlay → foreground) and checks
every row in two modes:

1. **translucent:** `surface-1` over `bg` and over every `backdrop` stop, worst case;
2. **solid:** `surface-1` replaced by `surface-1-solid`.

| Foreground | Background | Minimum |
| --- | --- | --- |
| `text-primary` | `surface-1` | 7:1 |
| `text-primary`, `text-secondary`, `text-muted` | `surface-1`, `surface-2`, `surface-3` | 4.5:1 |
| `text-primary` | `state-hover`, `state-selected` over each surface | 4.5:1 |
| `accent-text` | `surface-1`; `accent-subtle` over `surface-1` | 4.5:1 |
| `<s>-text` | `surface-1`; `<s>-subtle` over `surface-1` | 4.5:1 |
| `on-accent` | `accent`, `accent-hover`, `accent-active` | 4.5:1 |
| `on-<s>` | `<s>` | 4.5:1 |
| `focus-ring` | each surface | 3:1 |
| `link` | `surface-1`, `surface-2`, `surface-3` | 4.5:1 |

`text-disabled` is exempt. A photo backdrop cannot be checked.

## Error messages

Each error has a `rule` (`forbidden`, `syntax`, `single-block`, `selector`, `color-scheme`,
`unknown-property`, `duplicate`, `missing`, `value`, `reference`, `opaque`, `contrast`) and a
message naming the offending token and the allowed alternative, for example
`text-muted on surface-1 (translucent mode) is 3.74:1, needs 4.5:1`.

## Evolution

Version 2 adds the required content typography and link tokens above.
`CONTRACT_VERSION` increases only for a breaking change, together with a migration.
