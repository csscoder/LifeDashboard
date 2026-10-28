# Themes v2: palettes × styles and content typography

Status: design approved in chat on 2026-10-28; written spec awaiting review.

Sub-project 1 of 3 of the appearance rework. Sub-project 2 adds self-hosted font selection (Google Fonts families). Sub-project 3 adds a per-widget content scale. Both get their own spec.

## Goal

1. The user builds the dashboard look from three choices instead of picking one of three fixed themes: a **palette** (11 colour schemes, among them ten popular IDE schemes), a **mode** (light, dark, or auto from the system) and a **style** (Solid or Glass).
2. Built-in and SDK widgets get readable, theme-coloured content by default: plain semantic HTML (`h1`–`h3`, `p`, `small`, `a`, `code`) is styled by theme tokens.
3. The SDK docs teach widget authors and AI agents which tokens exist and that content uses them first, so a new widget (for example, the last three Telegram threads) is styled correctly without literal colours.

## Current state (2026-10-28)

- A theme is a fixed record `{ id, name, mode, skin, css }` (`apps/ui/app/theme/builtin.ts`): `builtin:glass` (dark, skin glass), `builtin:obsidian` (dark, solid), `builtin:paper` (light, paper). Their CSS is hand-written in `apps/ui/app/theme/styles/themes/*.css` and imported into `@layer ld.theme`.
- `apps/ui/app/theme/contract.ts` lists required and optional tokens; `validateThemeCss()` checks syntax, opacity, ranges and WCAG contrast in tests (`docs/theme-contract.md`, version 1).
- A theme id is assigned at four scopes: dashboard default (`localStorage`, `Appearance.schemaVersion 1`), space (`spaces.theme_id`), screen (`screens.theme_id`, `ScreenBoard.themeId`) and widget (`WidgetAppearance.themeId` in the board JSON, where `builtin:bare` removes the frame). Resolution: widget → screen → space → dashboard → `builtin:glass` (`apps/ui/app/theme/resolve.ts`, `apps/ui/app/app.vue`).
- `readThemeTokens()` (`apps/ui/app/widgets/context.ts`) reads every contract token from the computed style of the widget frame; the sandbox runtime applies them to its root (`packages/widget-sdk/src/theme.ts`). `context.theme` is `{ id, scheme, tokens }`.
- Four components hold their own theme list from `BUILTIN_THEMES`: `SettingsPanel.vue`, `spaces/SpacePicker.vue`, `spaces/ScreenDots.vue`, `board/WidgetSettings.vue`.
- No typography role tokens exist (only `font-ui`, `font-display`, `font-mono`, `font-scale`). Nothing styles content elements inside widgets.
- The SDK build (`packages/widget-sdk/scripts/build.ts`) reads the built-in theme CSS files to write `dist/dev/themes.json` for the dev shell and `ld-widget shot`; `shot` captures every theme × both frames by default. `design.md` tells authors to use `rem`.

## External facts

Checked on 2026-10-28 with Perplexity.

- All ten palettes are MIT-licensed (Gruvbox: MIT/X11) and have official light and dark variants. Canonical sources: https://github.com/catppuccin/palette, https://github.com/morhetz/gruvbox, https://github.com/primer/github-vscode-theme, https://github.com/altercation/solarized, https://github.com/tokyo-night/tokyo-night-vscode-theme, https://github.com/rose-pine/rose-pine-theme, https://github.com/sainnhe/everforest, https://github.com/atom/one-dark-syntax and https://github.com/atom/one-light-syntax, https://github.com/rebelot/kanagawa.nvim, https://github.com/ayu-theme/ayu-colors.
- WebKit supports relative colour syntax (`oklch(from var(--x) …)`) since Safari 16.4 and `color-mix(in oklch, …)` since Safari 16.2; WKWebView on macOS 15/26 uses the system WebKit. WebKit bug 273996: relative colours fail on a custom property assigned from `light-dark()`. This design generates static values and uses neither, so these facts only rule out a runtime-derivation constraint.

## Decisions

| Topic | Decision |
| --- | --- |
| Model | A choice is `{ palette, mode, style }`, assigned at the same four scopes as today and inherited as a whole (no per-field inheritance). |
| Mode | `light`, `dark` or `auto`; `auto` follows `prefers-color-scheme` live. |
| Styles | `solid` and `glass`. «No frame» stays a widget-only option. |
| Palettes | `lifedashboard` (today's Glass and Paper colours) plus Catppuccin, Gruvbox, GitHub, Solarized, Tokyo Night, Rosé Pine, Everforest, One, Kanagawa, Ayu. |
| Token source | A TS generator builds every token from palette seeds; a script writes a committed CSS file with one rule per combination (approach A). Runtime CSS derivation and hand-written combinations were rejected. |
| Contrast | Every combination must pass `validateThemeCss()`. A failing palette gets hand-tuned seed lightness, marked `// tuned for contrast`; the generator never adjusts seeds silently except the defined `*-text` search below. |
| Default content styling | Theme-token styles for semantic elements in a low-priority layer, in the host and in the sandbox. No opt-out. |
| Storage | Structured `ThemeChoice` replaces `themeId` everywhere; legacy ids migrate. |

## Contract

### `ThemeChoice` (`packages/contracts`)

```ts
export type ThemeMode = 'light' | 'dark' | 'auto'
export type ThemeStyle = 'solid' | 'glass'
export interface ThemeChoice {
  palette: string // 'builtin:<slug>', slug ^[a-z][a-z0-9-]{0,31}$
  mode: ThemeMode
  style: ThemeStyle
}
```

- `parseThemeChoice(raw)` accepts an object with exactly these keys and valid values; anything else is invalid.
- `SpaceSummary.theme: ThemeChoice | null`, `SpacePatch.theme?: ThemeChoice | null` (replace `themeId`).
- `ScreenBoard.theme?: ThemeChoice | null`; absent or null inherits; canonical responses omit it when null.
- `WidgetAppearance.theme: ThemeChoice | 'bare' | null` (replaces `themeId`; `'bare'` replaces `BARE_THEME_ID`). `normalizeAppearance` treats `theme: null` like today's `themeId: null`.
- Space and screen reject `'bare'`, as today.
- A syntactically valid but unknown palette is stored as is and inherits at resolution; the reference is never rewritten.

### Legacy input

Parsers accept the legacy fields and normalize them; writers emit only the new fields. When both are present, `theme` wins, including `theme: null` (inherit); `themeId` is read only when `theme` is absent. An invalid `theme` is rejected (400 in requests, invalid board as today) even when `themeId` is valid.

| Legacy `themeId` | `theme` |
| --- | --- |
| `builtin:glass` | `{ palette: 'builtin:lifedashboard', mode: 'dark', style: 'glass' }` |
| `builtin:obsidian` | `{ palette: 'builtin:lifedashboard', mode: 'dark', style: 'solid' }` |
| `builtin:paper` | `{ palette: 'builtin:lifedashboard', mode: 'light', style: 'solid' }` |
| `builtin:bare` (widget only) | `'bare'` |
| any other id or null | `null` |

- Board JSON: `ScreenBoard.themeId` and `WidgetAppearance.themeId` are normalized when parsed.
- SQLite: an additive migration adds `spaces.theme` and `screens.theme` (`TEXT`, JSON) and fills them from `theme_id` with the table above. `theme_id` stays and is no longer read or written.
- `localStorage` `lifedashboard.appearance`: `Appearance` becomes `{ schemaVersion: 2, theme: ThemeChoice | null }`. `loadAppearance()` maps a valid version 1 record with the table above; unreadable data yields the default as today.

Migrated assignments become generated combinations: colours come from the LifeDashboard palette, while borders, radii and shadows follow the shared style rules below. Glass stays close to today's look (same translucent recipe, radii, blur and shadows). Paper changes slightly (Solid radii and shadows, borders derived from one seed). Obsidian changes most: its neutral near-black becomes the violet-tinted dark Solid palette. Pixel-identical legacy themes are a non-goal.

### Resolution

- Chain: widget → screen → space → dashboard default → `DEFAULT_THEME = { palette: 'builtin:lifedashboard', mode: 'dark', style: 'glass' }`. The first set choice with a known palette wins.
- `useColorScheme()` (a composable over `matchMedia('(prefers-color-scheme: dark)')`, updating on `change`) turns `auto` into `light` or `dark`. Without `matchMedia`, `auto` resolves to `dark`.
- The resolved theme is a combination key `<slug>-<mode>-<style>` with mode `light` or `dark`. Classes: `space--theme-<key>`, `widget--theme-<key>`, plus `space--skin-<style>` and `widget--skin-<style>` (or `widget--skin-bare`).
- `resolveWidgetLook`: `'bare'` keeps the board key and skin `bare`; otherwise the widget's resolved key differs from the board's → `foreign: true` (opaque `surface-1`, as today).
- `context.theme` = `{ id: 'builtin:<key>', scheme: <resolved mode>, tokens }`. A system mode change re-reads tokens, so sandbox widgets update live.
- The dashboard default keeps today's notice when its stored palette is unknown («Theme not found, showing the default theme»).

### Theme contract version 2

`CONTRACT_VERSION` becomes 2. A theme is now a generated token set for one combination; no user themes exist, so no data migration is needed. `docs/theme-contract.md` is rewritten for: the choice model, the generator, the new tokens, the generated CSS file, and the contrast rows below. Importing user palettes stays planned.

New required tokens:

| Token | Type | Allowed values | Generated value |
| --- | --- | --- | --- |
| `font-heading`, `font-body` | font stack | as other font tokens | `system-ui, sans-serif` |
| `size-h1`, `size-h2`, `size-h3`, `size-body`, `size-small` | length, `em` | 0.75–3em, strictly descending in this order | 2em, 1.5em, 1.25em, 1em, 0.875em |
| `leading-heading` | number | 1.0–1.6 | 1.2 |
| `link` | colour, opaque | | equals `accent-text` |

- `font-ui` and `font-display` stay required; the generator sets them equal to `font-body` and `font-heading`.
- New contrast row: `link` on `surface-1`, `surface-2`, `surface-3` ≥ 4.5:1 in both translucent and solid modes.
- `frame.css` uses `font-body` instead of `font-ui` on `.space` and `.widget`.

## Palettes and generator

### Palettes (`apps/ui/app/theme/palettes.ts`)

```ts
interface Seed {
  bg: string
  surface: [string, string, string]
  text: [string, string, string, string] // primary, secondary, muted, disabled
  border: string
  accent: string
  success: string
  warning: string
  danger: string
  info: string
}
interface Palette { slug: string; name: string; source: string; light: Seed; dark: Seed }
```

Seeds are hex strings copied from the upstream source named in `source`; the generator converts them to `oklch()`. Variants:

| Slug | Name | Light | Dark |
| --- | --- | --- | --- |
| `lifedashboard` | LifeDashboard | today's Paper colours | today's Glass colours |
| `catppuccin` | Catppuccin | Latte | Mocha |
| `gruvbox` | Gruvbox | light, medium contrast | dark, medium contrast |
| `github` | GitHub | Light Default | Dark Default |
| `solarized` | Solarized | Light | Dark |
| `tokyo-night` | Tokyo Night | Day | Night |
| `rose-pine` | Rosé Pine | Dawn | Main |
| `everforest` | Everforest | Light medium | Dark medium |
| `one` | One | One Light | One Dark |
| `kanagawa` | Kanagawa | Lotus | Wave |
| `ayu` | Ayu | Light | Dark |

`BUILTIN_PALETTES` replaces `BUILTIN_THEMES`; `BUILTIN_PALETTE_IDS` replaces `BUILTIN_THEME_IDS`.

### Generator (`apps/ui/app/theme/generate.ts`)

`buildTokens(palette, mode: 'light' | 'dark', style): Record<string, string>` returns every required token and the optional tokens the style sets, as `--ld-*` names with CSS values. It is pure and deterministic.

Shared rules:

- `bg`, `surface-2`, `surface-3` and `text-*` come from the seed. The seed `border` is the strongest border: `border-strong` = `border`, `border-default` = `border` at alpha 0.7, `border-subtle` = `border` at alpha 0.45.
- `state-hover`, `state-active`, `state-selected`: `text-primary` at alpha 0.06, 0.10, 0.14.
- `scrim`: black at alpha 0.5 (dark) or 0.35 (light).
- `accent-hover`, `accent-active`: `accent` with L +0.05 and −0.05 (dark) or −0.05 and +0.05 (light).
- `accent-subtle`, `<s>-subtle`: the colour at alpha 0.12 (dark) or 0.16 (light).
- `accent-text`, `<s>-text`: start at the seed colour and move L by 0.01 towards `text-primary` until the colour reaches 4.5:1 on `surface-1` (both modes) and on its `*-subtle` over `surface-1`; give up after 50 steps by throwing, which fails the generator test.
- `on-accent`, `on-<s>`: whichever of `bg` and `text-primary` has the higher contrast on the fill.
- `focus-ring`, `link`: equal to `accent-text`.
- Type, motion, spacing and weights: today's Glass values plus the new tokens above.

Style rules:

| Token | Solid | Glass |
| --- | --- | --- |
| `surface-1` | `surface[0]` | white overlay `oklch(1 0 0 / 0.08)` (dark) or `oklch(1 0 0 / 0.55)` (light), today's Glass recipe |
| `surface-1-solid` | `surface[0]` | `surface[0]` |
| `backdrop` | `bg` | `radial-gradient(circle at 20% 10%, <accent at L 0.38 dark / 0.92 light, C ×0.5>, <bg> 60%)` |
| `radius-widget`, `radius-card`, `radius-control` | 0.75rem, 0.5rem, 0.375rem | 1rem, 0.75rem, 0.5rem |
| `shadow-widget` | `0 0.125rem 0.5rem` black at 0.12 (light) or 0.3 (dark) | `0 0.5rem 2rem` black at 0.3 |
| `shadow-raised` | `0 0.125rem 0.375rem` black at 0.12 or 0.3 | `0 0.25rem 0.75rem` black at 0.3 |
| `blur` | omitted | 1rem |
| `edge-highlight` | omitted | 0.18 |

Alpha values and backdrop lightness are starting values; the contrast tests are the gate, and implementation may tune them per style (never per palette) to pass.

### Generated CSS

- `pnpm -C apps/ui gen:themes` writes `apps/ui/app/theme/styles/themes/generated.css`: a header comment («generated, do not edit»), then for every palette × `light`/`dark` × `solid`/`glass` (44 rules) one rule `.space--theme-<key>, .widget--theme-<key> { color-scheme: <mode>; --ld-…: …; }`.
- `layers.css` imports `generated.css` into `ld.theme` and stops importing `glass.css`, `obsidian.css` and `paper.css`, which are deleted.
- `skins/paper.css` is deleted (Solid covers it); `skins/glass.css`, `skins/solid.css` and `skins/bare.css` stay. `SKINS` becomes `['solid', 'glass']`.

## Content typography

### Base styles (`apps/ui/app/theme/styles/content.css`)

- The layer order in `layers.css` becomes `ld.reset, ld.base, ld.frame, ld.skin, ld.theme, ld.utilities, ld.widget, ld.comfort`.
- Every rule is in `@layer ld.base` and selects `:where(.ld-content) :where(<element>)`, so specificity is zero and any widget style wins.
- Root: `:where(.ld-content)` sets `color: var(--ld-text-primary)`, `font-family: var(--ld-font-body)`, `font-size: var(--ld-size-body)`, `line-height: var(--ld-leading)` and `letter-spacing: var(--ld-tracking)`, so plain text inherits theme colour and font in the host and in the sandbox (where `frame.css` does not apply).
- Elements:
  - `h1`, `h2`, `h3` (and `h4`–`h6` as `h3`): `font-family: var(--ld-font-heading)`, `font-size: var(--ld-size-h1|h2|h3)`, `line-height: var(--ld-leading-heading)`, `font-weight: var(--ld-weight-strong)` for `h1`/`h2` and `var(--ld-weight-medium)` for `h3`+, `color: var(--ld-text-primary)`, `margin: 0 0 0.5em`.
  - `p`, `ul`, `ol`: `font-size: var(--ld-size-body)`, `margin: 0 0 0.75em`; lists `padding-left: 1.25em`.
  - The last child of any container has `margin-bottom: 0`.
  - `small`: `font-size: var(--ld-size-small)`, `color: var(--ld-text-secondary)`.
  - `a`: `color: var(--ld-link)`, `font-weight: var(--ld-weight-medium)`, no underline, underline on hover; `:focus-visible` has `outline: 0.125rem solid var(--ld-focus-ring)` and `outline-offset: 0.125rem`.
  - `code`: `font-family: var(--ld-font-mono)`, `font-size: var(--ld-size-small)`, `background: var(--ld-surface-2)`, `border-radius: var(--ld-radius-control)`, `padding: 0.1em 0.3em`.
  - `pre`: like `code`, block, `padding: 0.75em`, `overflow: auto`; `pre code` has no own background or padding and `font-size: inherit`.
  - `hr`: `border-top: var(--ld-border-width) solid var(--ld-border-subtle)`, `margin: 1em 0`.
  - `strong`, `b`: `font-weight: var(--ld-weight-strong)`.
- Host: `.widget__body` gets the class `ld-content`. The dashboard's own UI has no `ld-content` and is unaffected.
- Sandbox: the SDK build embeds `content.css` into the sandbox runtime (as it already embeds `frame.css` for the dev shell); the runtime inserts it in a `<style>` element before any widget CSS (CSP already allows `'unsafe-inline'` styles) together with a leading `@layer ld.base;` statement, and adds `ld-content` to `body`. Widget CSS is unlayered and always wins.

### Built-in widgets

`PlaceholderWidget.vue` and `clocks/analog_1` use semantic elements and `--ld-*` tokens only; any literal colour, font name or px font size in them is replaced.

## Theme picker UI

`apps/ui/app/theme/ThemePicker.vue`, `v-model: ThemeChoice | 'bare' | null`, props `inherit: boolean` (shows the Inherit option and the inherited choice), `bare: boolean` (shows «No frame»), `inherited: ThemeChoice` (what Inherit resolves to).

```
[ Inherit ]                          ← only with `inherit`; shows the inherited palette, mode and style
Palette  ■ ■ ■ ■                     ← 4-column grid of 11 tiles, a radio group with arrow-key navigation;
         ■ ■ ■ ■                       each tile is drawn by its own combination class: bg, a text line,
         ■ ■ ■                         an accent dot, and the palette name
Mode     ( Light | Dark | Auto )     ← UiRadioGroup
Style    ( Solid | Glass )           ← UiRadioGroup
         [ No frame ]                ← only with `bare`
```

- Tiles render in the mode the current selection resolves to, with style `solid`.
- Inherit or No frame disables the Mode and Style groups. Choosing a tile from Inherit or No frame takes mode and style from `inherited`.
- It replaces the theme lists in `SettingsPanel.vue` (dashboard default, no Inherit), `spaces/SpacePicker.vue` (space), `spaces/ScreenDots.vue` (screen; draft semantics with Done/Cancel unchanged) and `board/WidgetSettings.vue` (widget, with No frame). The surrounding save behaviour of each place is unchanged.

## SDK and agent knowledge

- `packages/widget-sdk/scripts/build.ts` imports the generator instead of reading theme CSS files. `dist/dev/themes.json` holds 44 entries `{ id: 'builtin:<key>', name: '<Palette> <Mode> <Style>', mode, skin: style, tokens }`. Dev shell `?theme=<key>`; its theme select lists all entries. The frame rules embed `skins/solid.css`, `skins/glass.css`, `skins/bare.css` and `content.css`.
- `ld-widget shot` without `--theme` captures the four reference combinations `builtin:lifedashboard-{light,dark}-{solid,glass}`; `--theme all` captures all 44; repeated `--theme builtin:<key>` stays allowed.
- `docs-src/design.md`:
  - «Theme tokens» names the choice model (palette, mode, style) and lists the new tokens in the Type group.
  - New section «Typography and content»: use semantic elements, which are already styled; size content text and spacing in `em` or with `size-*`; colours only from `--ld-*` with the role table (heading → `text-primary`, body → `text-primary`, secondary → `text-secondary`, hint → `text-muted`, link → `link`, emphasis → `accent-text`, status → `<s>-text` on `<s>-subtle`); a worked example of a «last three Telegram threads» list with cards on `surface-2`, the author in `small`, a link through `link`, and no literal colour.
  - «rem and rootFontSize» becomes «em, rem and rootFontSize»: content uses `em`; `rem` only for frame-independent values. The full scaling rule comes with sub-project 3.
- `packages/create-widget/template/AGENTS.md` gets the same three rules in short form.
- `docs/theme-contract.md` and `README.md` (Appearance rows) describe palettes, modes and styles.

## Error handling

- Invalid `ThemeChoice` in an API request: 400 with the existing validation error shape (`invalid space theme`, `invalid screen theme`, `invalid widget appearance`).
- Unknown palette in stored data: inherit; dashboard default shows the existing notice.
- `saveAppearance` failure: the choice stays applied in memory with «Could not save the theme», as today.
- Generator failure (no contrast-passing `*-text` within 50 steps): throws with the palette, mode, style and token; `gen:themes` and the tests fail.

## Testing

TDD with Vitest; each behaviour starts with a failing test.

- `packages/contracts`: `parseThemeChoice`; legacy normalization for space, screen and widget appearance; `'bare'` rejected for space and screen.
- `apps/api`: the migration fills `theme` from every legacy `theme_id`; `SpacePatch.theme` and board `theme` round-trip; legacy `themeId` in a stored board is returned as `theme`; `theme` (including `null`) wins over `themeId`; an invalid `theme` with a valid `themeId` is rejected.
- `apps/ui`:
  - `buildTokens` produces every required token for all 44 combinations, and each generated rule passes `validateThemeCss()`.
  - `generated.css` equals the generator output (drift check).
  - `loadAppearance` maps version 1 records.
  - Resolution covers inheritance, unknown palettes, `auto` with a mocked `matchMedia` change, `'bare'` and `foreign`.
  - `ThemePicker` covers Inherit, No frame, keyboard selection and taking mode/style from `inherited`.
  - `content.css` rules are all inside `@layer ld.base` and use `:where(.ld-content)`; plain text in `.ld-content` computes `text-primary` and `font-body`.
- `packages/widget-sdk`:
  - `themes.json` has 44 entries.
  - `shotCombos` defaults to the four reference ids and expands `all` to 44.
  - The sandbox runtime inserts the base CSS and the `ld-content` class.
  - `docs.test.ts` checks that the new section and every new token are documented.
- `pnpm typecheck`, `pnpm test`, `pnpm build`.
- Manual check in the Orca built-in browser on an isolated dev instance:
  - three or four palettes in both styles and both modes;
  - `auto` following a system appearance change;
  - a sandbox widget updating live;
  - the picker in all four places;
  - an existing database with Glass, Obsidian and Paper assignments showing the mapped choices, compared side by side with screenshots taken on `main` before the change.

## Out of scope

- Font family selection and self-hosted Google Fonts (sub-project 2).
- Per-widget content scale (sub-project 3).
- User or imported palettes, per-field inheritance, Soft and Outline styles.
- A `ld-widget check` lint for literal colours.
- Removing the legacy `theme_id` columns.
