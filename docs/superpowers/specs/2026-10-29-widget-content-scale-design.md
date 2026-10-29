# Widget content scale

Status: design approved in chat on 2026-10-29; Codex review approved (2 rounds); written spec awaiting user review.

Sub-project 3 of 3 of the appearance rework. Sub-project 1 (palettes × modes × styles, content typography) is merged: `docs/superpowers/specs/2026-10-28-themes-v2-palettes-design.md`. Sub-project 2 (theme fonts) is implemented on `feat/theme-fonts`: `docs/superpowers/specs/2026-10-29-theme-fonts-design.md`. This branch, `feat/widget-content-scale`, starts from `feat/theme-fonts` because it changes the same `WidgetFrame`, `WidgetHost` and `useWidgetContext` code.

## Goal

1. The user sets a per-widget text size from −50 % to +50 % in the widget settings. Example: a wide Telegram-posts widget whose 1-line text should grow to fill the space.
2. Content sized in `em` follows the setting in built-in widgets and in sandboxed SDK widgets, including widgets built for sdk 1–5.
3. The base stays the dashboard's `1rem` (16px at a 1280px window). The setting multiplies it; the text still scales with the window (base design §7.4).

## Current state (2026-10-29)

- The host root is fluid: `html { font-size: calc(100vw / 80) }` (`apps/ui/app/app.vue`).
- `.widget__body` sets `font-size: calc(var(--ld-font-scale) * 1rem)` (`apps/ui/app/theme/styles/frame.css`). Built-in widget content inherits it, so `em` already follows it. The theme token `font-scale` is `1` in every generated combination.
- The sandbox runtime (`packages/widget-sdk/src/sandbox.ts`) sets the frame root `font-size` to `context.rootFontSize` px; `body.ld-content` gets `var(--ld-size-body)` (`1em`). The sandbox ignores `--ld-font-scale`.
- `WidgetAppearance` is `{ theme, shadow, variant }` (`packages/contracts/src/board.ts`), stored as JSON in `widgets.appearance`. `normalizeAppearance` drops an appearance whose fields are all `null`. `apps/api/src/spaces.ts` fills missing keys of stored rows (`variant ?? null`).
- `withStyle`, `withShadow` and `withVariant` (`apps/ui/app/board/widget-settings.ts`) each rebuild the whole appearance.
- `WidgetContext` (`packages/contracts/src/widget-gateway.ts`) has `rootFontSize`. `SDK_LEVELS` is `[1, 2, 3, 4, 5]`, `SDK_TARGET_LEVEL` is 5. New context fields are documented as `Since sdk N`.
- `SandboxWidget.vue` sends the whole context to the frame whenever its JSON changes. `widgetModals.context()` gives a modal the caller's context with `frame: 'frameless'`.
- The built-in clock sizes its face in `cq*` units, so the setting barely changes it.
- `PlaceholderWidget.vue` uses the Uno utility `text-2xl`, which `apps/ui/uno.config.ts` defines in `rem` (`1.5rem` / `2rem` line height), so it ignores the parent font size.
- The settings panel's `Reset to defaults` asks «Style, shadow, look and widget options return to their defaults…» (`WidgetBoard.vue`) and `resetWidget` removes the whole appearance (`edit-session.ts`).

## Decisions

- The base is the dashboard's `1rem`, not a fixed 16px.
- Stored value: an integer offset in percent, `scale` in `[−50, 50]`; factor = `1 + scale / 100`.
- Delivery to the sandbox: a new public field `WidgetContext.contentScale`. Passing the factor as a theme token mixes a widget setting into the theme contract; multiplying `rootFontSize` breaks `rem` matching the board.
- The runtime scales `body` for every sandbox widget, whatever its manifest `sdk`. The field itself is `Since sdk 6`, for widgets that need the factor as a number (canvas).
- Widget CSS keeps priority over the scale: the sandbox applies the factor through a `ld.base` layer rule, never an inline style. A widget that sets its own `body` font size opts out unless it multiplies by `var(--ld-content-scale)`.
- A widget modal always uses factor 1: the setting fits content to the widget rectangle, and a modal has its own size.

## Contract

`packages/contracts/src/board.ts`:

```ts
export interface WidgetAppearance {
  theme: ThemeChoice | 'bare' | null
  shadow: DropShadow | null
  variant: string | null
  scale: number | null // integer percent offset in SCALE_LIMITS; null: 0
}
export const SCALE_LIMITS = [-50, 50] as const
```

- `normalizeAppearance` maps `scale: 0` to `null`, returns `undefined` when all four fields are `null`, and orders keys `theme, shadow, variant, scale`.
- `parseAppearance` reads `raw.scale ?? null`. A non-integer, a value outside `SCALE_LIMITS` or a non-number is an invalid appearance. A board without the key stays valid; no migration.
- `apps/api/src/spaces.ts` fills `scale: parsed.scale ?? null` when reading a stored row.

`packages/contracts/src/widget-gateway.ts`:

- `WidgetContext.contentScale: number` — the factor, 0.5–1.5, 1 by default. JSDoc `@since sdk 6`.
- `SDK_LEVELS = [1, 2, 3, 4, 5, 6]`, `SDK_TARGET_LEVEL = 6`.

## Host

- `widget-settings.ts`: `withStyle`, `withShadow` and `withVariant` keep `scale`. New `withScale(appearance, scale: number): WidgetAppearance` keeps the other three fields and stores `0` as `null`.
- `WidgetBoard.vue` passes `appearance?.scale ?? null` to `WidgetHost` as `scale`. The build draft passes nothing.
- `WidgetHost.vue`: prop `scale?: number | null`; passes it to `WidgetFrame` and the context source.
- `WidgetFrame.vue`: prop `scale?: number | null`. The root `.widget` gets inline `--ld-content-scale: <factor>` when `scale` is a non-zero number, merged with the font variables already set there.
- `frame.css`: `.widget__body { font-size: calc(var(--ld-font-scale) * var(--ld-content-scale, 1) * 1rem) }`.
- `PlaceholderWidget.vue`: replace `text-2xl` with a scoped `font-size: 1.5em; line-height: calc(4 / 3)` (unitless, so it follows the element's own size), the same 24px / 32px at factor 1. Built-in widget content must not use the `rem`-based Uno `text-*` utilities.
- `useWidgetContext` source gains `contentScale: () => number`; the context starts with it and a watch updates `context.contentScale`. The tokens do not depend on it, so the post-flush token watch does not change.
- `widgetModals.context()` returns `{ ...effective, frame: 'frameless', contentScale: 1, visible }`.

## Sandbox

- `sandbox.ts`:
  - the injected style gets, after `content.css`, `@layer ld.base { body.ld-content { font-size: calc(var(--ld-font-scale, 1) * var(--ld-content-scale, 1) * 1rem) } }`. Its specificity beats `content.css`'s `:where(.ld-content)` rule; unlayered widget CSS still wins over it;
  - the existing `watchEffect` sets `--ld-content-scale` on the frame root to `String(context.contentScale)`.
- At factor 1 and `font-scale` 1 the `body` size equals today's `1em` of the root, so existing widgets render unchanged. The sandbox now follows `font-scale` the same way the host does.
- `shellContext` (`packages/widget-sdk/src/dev/shell-state.ts`) sets `contentScale: 1`.
- No change to the API, the CSP or the sandbox document.

## Settings UI

In the Appearance block of `apps/ui/app/board/WidgetSettings.vue`, after the shadow controls:

```vue
<SettingsRow label="Text size, %">
  <UiNumberField integer :min="-50" :max="50" :model-value="appearance?.scale ?? 0"
    @update:model-value="emit('change', withScale(appearance, $event))" />
</SettingsRow>
```

- Shown for every widget, framed or bare.
- Edits follow the existing appearance path: the screen draft, Done/Cancel and save.
- There is no separate reset control: typing 0 resets the scale, and the existing `Reset to defaults` resets it with the rest of the appearance.
- The reset confirmation becomes «Style, shadow, look, text size and widget options return to their defaults. API keys stay set; use Clear to remove them.»

## Error handling

- An invalid `scale` in a request fails `parseScreenBoard` with the existing `invalid widget appearance` error.
- `UiNumberField` already rejects input outside its bounds or non-integers; the board never holds an invalid value.

## SDK and documentation

Edit `packages/widget-sdk/docs-src/` and regenerate with `pnpm -C packages/widget-sdk run docs`.

- `api.md`:
  - a `contentScale` row: "the user's text size for this widget, 0.5–1.5; the runtime already applies it to `body`. Since sdk 6";
  - «sdk levels» gets «Level 6: `context.contentScale`. The runtime scales `body` for packages of every level.»
- `design.md`, section «em, rem and rootFontSize»: the user scales widget content from 50 % to 150 %; only `em` and `size-*` sizes follow it, `rem` does not. A widget that sets its own `body` font size multiplies it by `var(--ld-content-scale)` to follow the setting. Read `contentScale` only when a px number is needed.
- `index.md` and `packages/create-widget/skill/lifedashboard-widget/SKILL.md`, if their summaries name `rootFontSize`: add `contentScale`.
- `README.md`: one line on the per-widget text size.

## Testing

TDD, Vitest.

- `packages/contracts`:
  - `parseScreenBoard` accepts `scale` −50 and 50;
  - rejects 51, −51, 1.5 and `'10'`;
  - `{ theme: 'bare', shadow: null, variant: null }` without `scale`, and the same with `scale: 0`, parse to `{ theme: 'bare', shadow: null, variant: null, scale: null }`;
  - an appearance whose four fields are `null` or `0` (and `{ theme: null, shadow: null, variant: null }`) parses to an instance without `appearance`;
  - `normalizeAppearance` key order `theme, shadow, variant, scale`;
  - `SDK_LEVELS` includes 6 and the target is 6.
- `apps/api`:
  - a board with `scale` survives a save and load;
  - a stored appearance JSON without `scale` loads as `scale: null`.
- `apps/ui`:
  - `withScale`, and `withStyle`, `withShadow` and `withVariant` keeping `scale`;
  - `WidgetFrame` sets `--ld-content-scale` only for a non-zero scale;
  - `frame.css` contains the formula;
  - `useWidgetContext` updates `contentScale`;
  - `widgetModals.context()` gives 1;
  - `WidgetSettings` emits `scale`;
  - `PlaceholderWidget` text is sized in `em`;
  - the reset confirmation names the text size, and `resetWidget` drops a `scale`.
- `packages/widget-sdk`:
  - the sandbox root `--ld-content-scale` follows `contentScale` changes, and the injected style holds the `body.ld-content` rule inside `@layer ld.base` (jsdom does not resolve cascade layers, so the cascade itself is checked manually);
  - the shell context has 1;
  - the docs test passes after regeneration.
- Manual, Orca browser on an isolated dev instance:
  - the placeholder widget and a sandbox widget at −50, 0 and +50: the computed text size changes;
  - a change applies live without reloading the iframe;
  - a sandbox widget whose own CSS sets `body { font-size: 0.75em }` keeps 12px at a 16px root and factor 1;
  - the modal stays at 1.

## Out of scope

- A screen- or space-level scale.
- Auto-fitting text to the widget size.
- Converting the clock from `cq*` to `em`.
- A scale control in the SDK dev shell.
- Scaling a widget modal.
