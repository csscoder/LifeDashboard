# Widget settings and looks

Status: approved and implemented on 2026-10-28. Revised the same day after review: a `color` setting type and a colour picker with an opacity slider (see «Revision 2026-10-28»).

## Goal

An AI agent that builds a widget from the SDK must know three capabilities and their rules:

1. **Settings.** User options are declared in `widget.json`, stored in the dashboard database per widget instance, each with a factory default, reset by one button, with secrets for API keys.
2. **Looks (variants).** One widget offers several visual designs of the same function (clock faces, hands) instead of several widgets.
3. **One settings panel.** The host draws the same panel for every widget, styled by the screen theme, with every control built on reka-ui.

## Current state (2026-10-28)

- The host renders the settings form from the manifest `settings` schema (`apps/ui/app/board/WidgetConfigForm.vue`). A sandboxed widget cannot render host components and does not draw its own settings panel.
- Values persist in `WidgetInstance.config` on the board (SQLite). Every plain setting requires `default`. «Reset widget settings» clears appearance and config (`resetWidget` in `apps/ui/app/board/edit-session.ts`). Secret settings (`type: "secret"` with `bind`) exist and are stored apart from `config`.
- The panel sits inside the root `space--theme-*` element, so it already uses the resolved screen theme (screen → space → dashboard, `apps/ui/app/app.vue`). Screen and space themes cannot be «No frame» (`packages/contracts/src/board.ts`, `space.ts`).
- Only `UiSelect` uses reka-ui. Text, number, checkbox, radio, range and colour controls and the buttons are native elements with per-file styles.
- No concept of a widget look exists. The SDK docs do not mention it.
- Lockfile resolves `reka-ui` 2.10.5. `SDK_TARGET_LEVEL` is 4.

## External facts

Checked on 2026-10-28 against the npm registry and the package files.

- `reka-ui` 2.11.0 was published 2026-10-05 and is `latest`. It adds `Field` (`FieldRoot`, `FieldLabel`, `FieldControl`, `FieldDescription`, `FieldError`, `FieldValidity`) and `Form` (`FormRoot`), both marked Alpha. Source: https://reka-ui.com/docs/components/form
- Neither 2.10.5 nor 2.11.0 has a Button component. Buttons use `Primitive as="button"`.
- 2.10.5 and 2.11.0 both provide `Switch`, `Slider`, `NumberField`, `RadioGroup`, `Select`, `ColorField`, `Separator`, `Label` and `Primitive`.

## Decisions

| Topic | Decision |
| --- | --- |
| Panel theme | The resolved screen theme. The widget's own style, including «No frame», never affects the panel. No fallback rule is needed because a screen theme is never «No frame». |
| Look model | A first-class manifest field `variants` and `context.variant` (not a convention on top of `settings`). |
| Look storage | `WidgetAppearance.variant`: it is host-owned look data, and `appearance` is never part of `config`. |
| Dependency | Upgrade `reka-ui` 2.10.5 → 2.11.0 in `apps/ui` (approved by the user on 2026-10-28). |
| Reset | Returns style, shadow, look and plain settings to defaults. Secrets stay set. |
| Dev shell | Keeps native controls. The SDK package gets no reka-ui dependency. |
| Colour setting | A `color` setting type (sdk 5) in `widget.json`; the host draws the colour picker for it (user decision 2026-10-28, instead of exporting a Vue component from the SDK). |
| Opacity | A separate number next to `#rrggbb`, never an 8-digit hex. The shadow's opacity moves into the colour picker; board data is unchanged (user decision 2026-10-28). |

## Contract

### Manifest `variants` (sdk 5)

```json
"variants": {
  "default": "classic",
  "items": [
    { "id": "classic", "title": "Classic" },
    { "id": "minimal", "title": "Minimal" },
    { "id": "roman", "title": "Roman numerals" }
  ]
}
```

- Optional. Without it the widget behaves as before.
- `items`: 2 to `VARIANT_LIMITS.items` (16) entries with distinct `id`s.
- `id`: `^[a-z][a-z0-9-]{0,31}$`.
- `title`: plain text, 1 to `TITLE_MAX` characters, validated like a setting title.
- `default`: one of the `id`s.
- No other keys in `variants` or in an item.
- A manifest with `variants` and `sdk` below 5 is rejected.
- `SDK_LEVELS` becomes `[1, 2, 3, 4, 5]` and `SDK_TARGET_LEVEL` becomes 5.
- One parser in `packages/contracts` serves the API package import, the UI catalog and `ld-widget check`.

### Setting type `color` (sdk 5)

```json
"accent": { "type": "color", "title": "Accent", "default": "#2d6687" }
```

- The value and `default` are `#rrggbb` hex, matched case-insensitively. No alpha channel.
- `enum`, `minimum`, `maximum` and `maxLength` are rejected on it, as on other non-matching types.
- A manifest with a `color` setting and `sdk` below 5 is rejected: `manifest.settings.<key> color needs sdk 5`.
- `widget-env.d.ts` types it as `string`. The host panel draws `UiColorField`; the dev shell draws a native colour input.

### Instance

- `WidgetAppearance` gains `variant: string | null`. `null` means the manifest default.
- The board parser accepts `null` or a string that matches the `id` pattern. It does not know the manifest.
- `normalizeAppearance` drops the appearance when `themeId`, `shadow` and `variant` are all `null`.
- A stored board without `variant` parses as `variant: null`. No migration is needed.

### Resolution

`resolveVariant(variants, stored)` in `packages/contracts`:

- no `variants` → `''`;
- `stored` is one of the `id`s → `stored`;
- otherwise (`null`, unknown after a version change) → `variants.default`.

The stored value is never rewritten. This matches the handling of an unknown `themeId`.

### Runtime

- `WidgetContext.variant: string`: the resolved id, `''` without `variants`.
- It is reactive. A change in the panel updates the running widget without a reload.
- A named modal receives the same `variant` as its compact widget.
- `widget-env.d.ts`, generated by `check` and `build`, types `variant` as the union of the manifest ids (`''` without `variants`).

## Host settings panel

### Controls (`apps/ui/app/ui/`)

Every control follows the `UiSelect` pattern: global styles from `--ld-*` tokens only, `$attrs` on the focusable element so `<label for>` names it, no portal (the panel sits in the top layer).

| Component | reka-ui | Used for |
| --- | --- | --- |
| `UiSelect` (exists) | `Select` | Version, Style, Look, `enum` settings, clock offset and zone |
| `UiSwitch` | `Switch` | Shadow, `boolean` settings, clock System time |
| `UiSlider` | `Slider` | Shadow X, Y, Blur, Opacity |
| `UiNumberField` | `NumberField` | `number` and `integer` settings |
| `UiRadioGroup` | `RadioGroup` | Clock notation UTC/GMT |
| `UiColorField` | `ColorField`, `ColorSwatch`, `Popover`, `ColorArea`, `ColorSlider` | Shadow colour and opacity, `color` settings |
| `UiTextField` | `FieldControl` | `string` and `secret` settings |
| `UiButton` | `Primitive as="button"` | Apply version, Set, Clear, Reset |

`SettingsRow.vue` (`apps/ui/app/board/`) owns the row grid (label, control, value) and builds on `FieldRoot`, `FieldLabel`, `FieldDescription` and `FieldError`. This replaces the hand-built `aria-describedby` wiring in `WidgetConfigForm.vue`. `FormRoot` is not used: settings apply on change, with no submit.

No native form control remains in `WidgetSettings.vue`, `WidgetConfigForm.vue` or built-in editors (`ClockAnalog1Settings.vue`).

Value contracts the controls must keep (reka-ui defaults differ: `NumberField` has `step: 1` with step snapping, `ColorField` accepts and emits alpha hex):

- `UiNumberField`: a `number` setting keeps any valid value without rounding to a step or losing precision (for example `1.25`, `0.125`). An `integer` setting stays whole. `minimum` and `maximum` from the schema clamp the value. Every emitted value passes `parseFieldInput`.
- `UiColorField`: emits only `#rrggbb`. Input with an alpha channel is rejected and leaves the model unchanged. A swatch button opens a popover with a saturation/brightness area and a hue slider; the hex text field stays beside the swatch. With an optional `alpha` model (0..1, rounded to 0.01) the popover adds an opacity slider and emits `update:alpha` apart from the colour. The swatch shows transparency on a black and white checkerboard. The picker keeps its HSB colour, so the hue survives black and grey.

### Structure

One structure for every widget. `Separator` divides the blocks.

1. **Package**: Version and Apply version, only for package widgets.
2. **Appearance**: Style (frame), Look (only when the manifest declares `variants`), Shadow and its parameters (X, Y, Blur, then Color with the opacity slider in its picker).
3. **Widget**: the schema form or a built-in editor. Built-in editors use `SettingsRow` and the `Ui*` controls. The block, with its separator, is left out when the widget has no settings.
4. **Footer**: «Reset to defaults».

### Theme

The panel stays outside the widget cards, inside the `space--theme-*` root. A test pins this: a widget with «No frame» or another theme than the screen does not change the panel's theme.

### Reset

- Label: «Reset to defaults».
- It sets `appearance` to none (style, shadow, look) and `config` to `{}` (manifest defaults), as `resetWidget` does now.
- Secrets stay set. The confirmation says so: «Style, shadow, look and widget options return to their defaults. API keys stay set; use Clear to remove them.»

### Package version change

A `variant` id missing from the new version shows the default. The stored value is kept.

## SDK and agent knowledge

### `packages/create-widget/template/AGENTS.md`

New section «Settings and looks»:

- Declare user options (time zone, units, city) in `settings` in `widget.json`. The dashboard draws one settings panel for every widget. Do not build a settings form in the widget or in a modal.
- The dashboard stores the values in its database per widget instance. Every plain setting needs `default`: the factory value that «Reset to defaults» restores.
- API keys and tokens are `secret` settings with `bind`. The widget sees only `true` or `false`.
- `settings` hold what the user chooses; `widget.state` holds data the widget produces.
- Several visual designs of one function (clock faces, hands, gauge styles) are one widget with `variants`, not several widgets. A variant changes the look only, never data or behavior. Draw every variant with `--ld-*` tokens. Read `context.variant`.
- Workflow step 1 also covers every variant.

### `packages/widget-sdk/docs-src/`

- `settings.md`: who draws the panel, storage and reset, `settings` vs `state`, when to use `secret`, the `color` type.
- `design.md`: new section «Looks (variants)» with the rules above and a clock example.
- `api.md`: `variant` row in the context table, since sdk 5.
- `index.md`: `variants` in the manifest list and example.
- New placeholders (such as `{{VARIANTS_MAX}}`) come from `contracts` through `scripts/docs.ts`. Regenerate `docs/`.

### CLI

- `ld-widget check` validates `variants` with the shared parser and reports problems in its usual format.
- `ld-widget shot` also captures each variant at the `default` size.

### Dev shell (`packages/widget-sdk/shell`)

- A native Look select, shown when the manifest declares `variants`.
- A `variant` URL parameter, like `theme`. An unknown value falls back to the default.

### Reference example

`examples/widgets/showcase-clock` gets three variants (`classic`, `minimal`, `roman`) and a time zone setting with a default. It builds with `ld-widget build` and imports into the dashboard.

## Error handling

- Invalid `variants` in a manifest: package import and `check` fail with a message naming the field.
- Invalid `appearance.variant` in a board payload: the API rejects the board like any other invalid appearance.
- Unknown stored `variant`: resolves to the default, no error.

## Testing

TDD with Vitest; a failing test precedes each behavior change.

- `contracts`: `variants` parsing (count limits, id pattern, distinct ids, title rules, default in list, extra keys, `sdk` below 5 rejected); `appearance.variant` parsing and `normalizeAppearance`; `resolveVariant`.
- `widget-sdk`: `check` messages; generated `variant` type; `context.variant` in the sandbox and in a modal, including live change; dev shell parameter and select; `shot` per variant; `docs.test.ts` placeholders.
- `apps/ui`: each `Ui*` control (value in, event out, label association, disabled state); `UiNumberField` with a fractional value, a value with several decimals, `minimum`/`maximum` and an `integer` setting; `UiColorField` with alpha input (rejected) and an emitted value accepted by the board parser; Look shown only with `variants`; Look change writes `appearance.variant`; reset clears it and keeps secrets; version change with a missing id shows the default; panel theme independent of the widget style.
- `create-widget`: template contains the new section.
- Full `pnpm typecheck`, `pnpm test`, `pnpm build`. Manual check in the Orca browser: panel in each screen theme, all controls, reset, the showcase clock's three looks.

## Out of scope

- Human-readable labels for plain `enum` settings.
- Preview images for variants.
- Variants for the built-in `ClockAnalog1`.
- reka-ui in the dev shell.
- Clearing secrets on reset.
- Alpha in `color` settings.
- A colour picker component exported from the SDK for a widget's own UI.

## Revision 2026-10-28

After the implementation review the user asked for a real colour picker built from reka-ui colour components, an opacity slider, and the picker available to widget authors. Decisions are recorded in the table above («Colour setting», «Opacity»). Behaviour checked in the Orca browser: the area renders its gradient, the opacity slider lowers the shadow opacity, the swatch shows the checkerboard. `color` settings are covered by unit tests only; no example declares one.
