# Widget Settings and Looks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-class widget looks (`variants`, sdk 5), rebuild the host widget settings panel on reka-ui with one structure for every widget, and teach AI widget authors about settings, reset, secrets and looks.

**Architecture:** `packages/contracts` owns the `variants` parser, `resolveVariant`, `WidgetAppearance.variant` and `WidgetContext.variant`; every consumer (API import, UI catalog, `ld-widget check`, dev shell) uses those. The UI host resolves the look per instance and puts it into the widget context; the settings panel writes `appearance.variant`. New `Ui*` controls in `apps/ui/app/ui/` wrap reka-ui 2.11.0 primitives and are the only controls the panel and built-in editors use.

**Tech Stack:** TypeScript (strict), Vue 3.5, Nuxt 4, reka-ui 2.11.0, Vitest 5, pnpm 10 monorepo.

**Spec:** `docs/superpowers/specs/2026-10-28-widget-settings-and-looks-design.md`

## Global Constraints

- Work in a separate git worktree on branch `feat/widget-settings-and-looks` from `main` HEAD (superpowers:using-git-worktrees). The main checkout has the user's uncommitted and staged changes (`README.md`, `pnpm-lock.yaml`, staged deletions under `examples/widgets/hermes-tasks/`); never touch, stage or commit them.
- Stage only the files the task names. No push, no PR.
- Commit messages: Conventional Commits subject (`feat(contracts): …`), at most one or two body lines, no attribution trailers.
- TDD: write the test, run it and see it fail for the expected reason, then implement.
- Only new dependency: `reka-ui` `2.11.0` (exact pin) in `apps/ui`. No other dependency changes; no reka-ui in `packages/widget-sdk`.
- `SDK_LEVELS = [1, 2, 3, 4, 5]`, `SDK_TARGET_LEVEL = 5`. `variants` needs sdk 5.
- `VARIANT_LIMITS.items = 16`; item count 2..16; id pattern `^[a-z][a-z0-9-]{0,31}$`; title = plain text 1..60 (`isPlainText`).
- Board parser accepts `appearance.variant` = `null` or a string matching the id pattern; a stored appearance without `variant` parses as `variant: null`.
- `context.variant` is the resolved id, `''` when the manifest declares no `variants`.
- Panel copy (exact): block control label `Look`; reset button `Reset to defaults`; reset confirmation `Style, shadow, look and widget options return to their defaults. API keys stay set; use Clear to remove them.`
- Controls use only `--ld-*` tokens; no portal (`SelectPortal :disabled="true"` pattern); `$attrs` go to the focusable element (`defineOptions({ inheritAttrs: false })`).
- `UiNumberField`: `number` keeps any valid value without step rounding or precision loss; `integer` stays whole; schema `minimum`/`maximum` clamp (an out-of-range entry becomes the bound); empty or non-numeric entry is rejected and the field shows the last valid value again. `UiColorField`: emits only `#rrggbb`; input with an alpha channel (the typed text, before reka-ui normalizes it) is rejected and the model is unchanged.
- Reset keeps secrets.
- Repository artifacts in English.
- Subagent models (CLAUDE.local.md): implementers Haiku 5.5, task reviewers Sonnet 5.5, final whole-branch review Opus 5.5.

## Review Focus

1. A board saved before this change (appearance `{ themeId, shadow }` without `variant` in SQLite) loads through the API with `variant: null` and saves with other fields unchanged. → Task 2 tests `parses a stored appearance without variant` (contracts) and `reads a legacy appearance row with variant null` (API).
2. An instance stored with `variant: "roman"` switched to a package version without `variants`: `context.variant` is `''`, the Look control is hidden, the stored value is kept. → Task 3 test `drops the look when the version has no variants`, Task 9 test `hides Look without variants`.
3. A widget with style «No frame» or a foreign theme: the settings panel still renders inside the board root, never inside the widget card. → Task 9 test `panel stays outside widget cards`.
4. Clearing a number setting or typing text into it: no `change` is emitted and the field shows the last valid value again; an out-of-range entry is clamped to the bound. → Task 7 tests `does not emit an invalid number` and `restores the last value after an empty entry`; Task 12 manual check.
5. Reset on a widget with a set secret and a chosen look: `appearance` becomes `null` (look back to default), `config` `{}`, no secret API call. → Task 9 test `reset keeps secrets and clears the look`.

---

### Task 1: `variants` manifest field and sdk 5

**Files:**
- Create: `packages/contracts/src/widget-variants.ts`
- Modify: `packages/contracts/src/widget-gateway.ts:341-343` (levels), `packages/contracts/src/widget-package.ts` (`MANIFEST_KEYS`, `WidgetPackageManifest`, `parseManifest`)
- Regenerate: `packages/widget-sdk/docs/` (the level placeholders change; `scripts/build.ts` runs `checkDocs` and the SDK test setup packs the package, so stale docs fail the SDK tests)
- Test: `packages/contracts/test/widget-variants.test.ts`, `packages/contracts/test/widget-package.test.ts`

**Interfaces:**
- Produces (`widget-variants.ts`):
  - `export interface WidgetVariant { id: string; title: string }`
  - `export interface WidgetVariants { default: string; items: WidgetVariant[] }`
  - `export const VARIANT_LIMITS = { items: 16 } as const`
  - `export function isVariantId(value: unknown): value is string`
  - `export function parseVariants(raw: unknown): ParseResult<WidgetVariants>`
  - `export function resolveVariant(variants: WidgetVariants | undefined, stored: string | null | undefined): string`
- Produces: `WidgetPackageManifest.variants?: WidgetVariants` (key left out when absent, like `frame`).

- [ ] **Step 1: Write failing tests** in `widget-variants.test.ts`:
  - `parseVariants` accepts `{ default: 'classic', items: [{ id: 'classic', title: 'Classic' }, { id: 'roman', title: 'Roman numerals' }] }` and returns it.
  - Rejects with these exact errors: one item or 17 items → `manifest.variants.items must have 2–16 entries`; id `Classic`, `1a`, 33-char id → `manifest.variants.items[0].id must match ^[a-z][a-z0-9-]{0,31}$`; repeated id → `manifest.variants.items[1].id "classic" is a duplicate`; title `''` or 61 chars → `manifest.variants.items[0].title must be 1–60 characters of plain text`; default `'gothic'` → `manifest.variants.default must be one of the item ids`; extra key in root or item → `manifest.variants: unknown field "x"` / `manifest.variants.items[0]: unknown field "x"`; non-object → `manifest.variants must be an object with default and items`.
  - `resolveVariant(undefined, 'roman') === ''`; `resolveVariant(v, 'roman') === 'roman'`; `resolveVariant(v, null) === 'classic'`; `resolveVariant(v, 'gone') === 'classic'`.
  - In `widget-package.test.ts`: a valid sdk 5 manifest keeps `variants`; the same with `sdk: 4` fails with `manifest.variants needs sdk 5`; a manifest without `variants` has no `variants` key; `sdk: 6` fails with the existing "needs a newer LifeDashboard (this one supports 1–5)" message.
- [ ] **Step 2: Run** `pnpm -C packages/contracts test` — Expected: FAIL (module `widget-variants.ts` missing).
- [ ] **Step 3: Implement** `widget-variants.ts` with `fail`, `isRecord`, `isPlainText`, `unknownKey` from `parse.ts`; add `5` to `SDK_LEVELS`, set `SDK_TARGET_LEVEL = 5`; add `'variants'` to `MANIFEST_KEYS` and parse it in `parseManifest` after `frame` (sdk check first).
- [ ] **Step 4: Run** `pnpm -C packages/contracts test` and `pnpm -C packages/contracts typecheck` — Expected: PASS. Run `pnpm -C packages/widget-sdk docs` to regenerate `packages/widget-sdk/docs/`. Then `pnpm test` from the root: fix any test that hard-codes target level 4 or level list `1, 2, 3, 4` (docs, CLI, build fixtures) by updating the expected value only.
- [ ] **Step 5: Commit** the contracts files, the regenerated `packages/widget-sdk/docs/*.md` and any updated test files — `feat(contracts): add widget variants and sdk 5`

### Task 2: `appearance.variant` on the board

**Files:**
- Modify: `packages/contracts/src/board.ts` (`WidgetAppearance`, `parseAppearance`, `normalizeAppearance`)
- Modify: `apps/api/src/spaces.ts:273` (read path: the stored appearance JSON goes through `normalizeAppearance({ ...parsed, variant: parsed.variant ?? null })` instead of a bare cast)
- Modify: every `WidgetAppearance` literal the typecheck reports (expected: `apps/ui/app/board/widget-settings.ts`, `apps/ui/app/board/edit-session.ts`, tests)
- Test: `packages/contracts/test/board.test.ts`, `apps/api/test/spaces.test.ts`, `apps/ui/test/widget-settings.test.ts`

**Interfaces:**
- Consumes: `isVariantId` (Task 1).
- Produces: `WidgetAppearance { themeId: string | null; shadow: DropShadow | null; variant: string | null }`; `normalizeAppearance` returns `undefined` only when all three are `null`.
- Produces (`apps/ui/app/board/widget-settings.ts`): `export function withVariant(appearance: WidgetAppearance | undefined, variant: string | null): WidgetAppearance` — keeps `themeId`/`shadow`; `withStyle` and `withShadow` keep `variant`.

- [ ] **Step 1: Write failing tests** in `board.test.ts`: `parses a stored appearance without variant` (`{ themeId: 'builtin:paper', shadow: null }` → `variant: null`); `{ themeId: null, shadow: null, variant: 'roman' }` is kept; `{ themeId: null, shadow: null, variant: null }` → appearance absent; `variant: 'Roman'` and `variant: 3` make the board invalid. In `spaces.test.ts`: `reads a legacy appearance row with variant null` — write a widget row whose `appearance` column is `{"themeId":"builtin:paper","shadow":null}`, load the board through the API, expect `appearance` `{ themeId: 'builtin:paper', shadow: null, variant: null }`; save that board back and expect the other fields unchanged. In `widget-settings.test.ts`: `withVariant(undefined, 'roman')` → `{ themeId: null, shadow: null, variant: 'roman' }`; `withStyle` on an appearance with `variant: 'roman'` keeps it.
- [ ] **Step 2: Run** `pnpm -C packages/contracts test`, `pnpm -C apps/api test -- spaces` and `pnpm -C apps/ui test -- widget-settings` — Expected: FAIL.
- [ ] **Step 3: Implement** the contract change and `withVariant`; fix the literals `pnpm typecheck` reports.
- [ ] **Step 4: Run** `pnpm typecheck` and `pnpm test` — Expected: PASS (API board tests included).
- [ ] **Step 5: Commit** — `feat(contracts): store the widget look in its appearance`

### Task 3: `context.variant` at runtime

**Files:**
- Modify: `packages/contracts/src/widget-gateway.ts` (`WidgetContext`)
- Modify: `apps/ui/app/widgets/catalog.ts` (`SourceInfo.variants`), `apps/ui/app/widgets/context.ts` (`variant` source + watcher), `apps/ui/app/widgets/WidgetHost.vue` (prop `variant?: string | null`), `apps/ui/app/board/WidgetBoard.vue` (pass `instance.appearance?.variant ?? null`)
- Modify: `packages/widget-sdk/src/widget.ts` (typing), `packages/widget-sdk/src/index.ts` (export `type WidgetVariantMap`, `type WidgetVariantId` next to `WidgetConfig`, so `declare module '@lifedashboard/widget-sdk'` can augment it), `packages/widget-sdk/src/dev/shell-state.ts`, `packages/widget-sdk/shell/App.vue`, `packages/widget-sdk/shell/Toolbar.vue`
- Test: `apps/ui/test/widget-context.test.ts`, `apps/ui/test/catalog.test.ts`, `apps/ui/test/widget-host.test.ts`, `packages/widget-sdk/test/shell-state.test.ts`, `packages/widget-sdk/test/widget.test.ts`

**Interfaces:**
- Consumes: `WidgetVariants`, `resolveVariant` (Task 1); `appearance.variant` (Task 2).
- Produces: `WidgetContext.variant: string` (doc comment `@since sdk 5`, resolved id or `''`).
- Produces: `useWidgetContext` source gains `variant: () => string`; `WidgetHost` computes it as `resolveVariant(info.value?.variants, props.variant)`. Named modals keep reading the caller's context, so they get the same value with no extra code.
- Produces (`widget.ts`): `export interface WidgetVariantMap {}`; `export type WidgetVariantId = [keyof WidgetVariantMap] extends [never] ? '' : Extract<keyof WidgetVariantMap, string>`; `Widget['context']` becomes `DeepReadonly<Omit<WidgetContext, 'config' | 'variant'> & { config: WidgetConfig; variant: WidgetVariantId }>`.
- Produces (`shell-state.ts`): `ShellState.variant: string`; `parseShellState` reads URL `variant` through `resolveVariant(manifest.variants, param)`; `serializeShellState` writes it only when the manifest has variants; `describeShell` appends ` variant=<id>` when non-empty; `shellContext` sets `variant: state.variant`.

- [ ] **Step 1: Write failing tests:**
  - `widget-context.test.ts`: the context starts with the source's variant and updates when it changes (same pattern as the existing `frame` test).
  - `catalog.test.ts`: `describeSource` of a package version with `variants` returns them; without → no `variants` key.
  - `widget-host.test.ts`: `drops the look when the version has no variants` — `variant: 'roman'` with a manifest without variants gives `context.variant === ''`; with variants and `variant: 'gone'` gives the default.
  - `shell-state.test.ts`: `?variant=roman` → `'roman'`; `?variant=gone` and missing → default; no variants → `''` and the serialized URL has no `variant`.
  - `widget.test.ts`: the widget context exposes `variant` read-only.
  - `widget-modal-controller.test.ts`: a modal opened by a caller whose context has `variant: 'roman'` gets `'roman'`, and gets the new value after the caller's variant changes.
- [ ] **Step 2: Run** `pnpm -C apps/ui test` and `pnpm -C packages/widget-sdk test` — Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the interfaces above. Dev shell: a native `<select>` labelled `Look` in `Toolbar.vue`, rendered only when `manifest.variants` exists, options = item titles, change → update `state.variant` and the URL like the theme select does.
- [ ] **Step 4: Run** `pnpm typecheck` and `pnpm test` — Expected: PASS (including `dev-parity.test.ts`; if it compares context keys, add `variant` to its expected set).
- [ ] **Step 5: Commit** — `feat: expose the resolved widget look as context.variant`

### Task 4: CLI — typed variant ids and shots per look

**Files:**
- Modify: `packages/widget-sdk/src/config-declaration.ts`, `packages/widget-sdk/src/shot.ts`
- Test: `packages/widget-sdk/test/config-declaration.test.ts`, `packages/widget-sdk/test/shot.test.ts`, `packages/widget-sdk/test/check.test.ts`

**Interfaces:**
- Consumes: `parseVariants`, `WidgetVariants` (Task 1); `WidgetVariantMap` (Task 3).
- Produces: `renderConfigDeclaration(settings: SettingsSchema | undefined, variants?: WidgetVariants): string` — with variants it adds, inside the same `declare module` block, `interface WidgetVariantMap {\n    "classic": true\n    ...\n  }` in manifest order. `writeConfigDeclaration` parses `raw.variants` with `parseVariants` and throws `Invalid widget.json: <error>` on failure.
- Produces: `ShotCombo.variant?: string`; `shotCombos(sizing, themeIds, options, look: { variants?: WidgetVariants; frame?: ShotFrame } = {})` appends one combo per variant id at `sizing.default`, theme `(options.themes ?? themeIds)[0]`, frame `look.frame ?? 'framed'`; `shotFileName` adds `-<variant>` before `.png` for those combos; navigation adds `&variant=<id>`; `takeShots` passes `{ variants: info.manifest.variants, frame: info.manifest.frame }`.

- [ ] **Step 1: Write failing tests:** declaration snapshot with `variants` (union keys present) and without (no `WidgetVariantMap`); a compile check in the existing declaration typecheck test (the one that runs `tsc` on a generated `widget-env.d.ts`): with variants `classic`/`roman`, `const v: 'classic' | 'roman' = widget.context.variant` compiles and `const bad: typeof widget.context.variant = 'gothic'` is a type error; without variants `widget.context.variant` has type `''`; `shotCombos` with 3 variants returns the base combos plus 3 variant combos with the exact fields above; `shotFileName({ w: 6, h: 6, theme: 'builtin:glass', frame: 'frameless', variant: 'roman' }) === '6x6-glass-frameless-roman.png'`; `checkWidget` on a fixture whose `widget.json` has `variants.default: 'gone'` reports a `manifest` problem containing `manifest.variants.default must be one of the item ids`.
- [ ] **Step 2: Run** `pnpm -C packages/widget-sdk test` — Expected: FAIL.
- [ ] **Step 3: Implement** the interfaces above.
- [ ] **Step 4: Run** `pnpm -C packages/widget-sdk test` and `pnpm -C packages/widget-sdk typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(widget-sdk): type variant ids and shoot every look`

### Task 5: Upgrade reka-ui to 2.11.0

**Files:**
- Modify: `apps/ui/package.json`, `pnpm-lock.yaml` (in the worktree)

- [ ] **Step 1: Run** `pnpm -C apps/ui add reka-ui@2.11.0 --save-exact`.
- [ ] **Step 2: Verify** `apps/ui/package.json` has `"reka-ui": "2.11.0"` and `git diff pnpm-lock.yaml` changes only reka-ui entries (and its own transitive deps).
- [ ] **Step 3: Run** `pnpm -C apps/ui test` and `pnpm -C apps/ui typecheck` — Expected: PASS (`ui-select.test.ts` included). On a failure caused by the upgrade, stop and report; do not patch around it.
- [ ] **Step 4: Commit** `apps/ui/package.json pnpm-lock.yaml` — `build(ui): upgrade reka-ui to 2.11.0`

### Task 6: Simple controls — `UiSwitch`, `UiSlider`, `UiRadioGroup`, `UiButton`

**Files:**
- Create: `apps/ui/app/ui/UiSwitch.vue`, `UiSlider.vue`, `UiRadioGroup.vue`, `UiButton.vue`
- Test: `apps/ui/test/ui-controls.test.ts` (stub reka parts as host nodes, as in `ui-select.test.ts`)

**Interfaces:**
- `UiSwitch`: props `modelValue: boolean`, `disabled?: boolean`; emits `update:modelValue(boolean)`; `SwitchRoot` + `SwitchThumb`; `$attrs` on `SwitchRoot`.
- `UiSlider`: props `modelValue: number`, `min: number`, `max: number`, `step?: number` (default 1), `disabled?: boolean`; emits `update:modelValue(number)`; `SliderRoot` (array model `[value]`) + `SliderTrack` + `SliderRange` + `SliderThumb`; `$attrs` on `SliderThumb`.
- `UiRadioGroup`: props `modelValue: string`, `options: readonly { value: string; label: string }[]`, `disabled?: boolean`; emits `update:modelValue(string)`; `RadioGroupRoot` + one `RadioGroupItem`/`RadioGroupIndicator` + label per option; `$attrs` on `RadioGroupRoot`.
- `UiButton`: `Primitive as="button" type="button"`, prop `disabled?: boolean`, default slot, class `ui-button`; attrs and listeners pass through.

- [ ] **Step 1: Write failing tests** per control: attrs (`id`, `aria-describedby`) land on the named focusable part; model value reaches the reka part; the reka update event re-emits `update:modelValue` with the right type (slider unwraps `[12]` → `12`); `disabled` reaches the root; `UiButton` renders a `button` with `type="button"` and forwards `click`.
- [ ] **Step 2: Run** `pnpm -C apps/ui test -- ui-controls` — Expected: FAIL (components missing).
- [ ] **Step 3: Implement** the four components; unscoped styles from `--ld-*` tokens matching `UiSelect` (height `1.75rem`, `--ld-surface-3`, `--ld-border-default`, `--ld-radius-control`, focus ring `0.125rem solid var(--ld-focus-ring)`, checked/range fill `--ld-accent`, disabled opacity `0.6`).
- [ ] **Step 4: Run** `pnpm -C apps/ui test -- ui-controls` — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(ui): add reka-ui switch, slider, radio group and button`

### Task 7: Value controls — `UiNumberField`, `UiColorField`, `UiTextField`

**Files:**
- Create: `apps/ui/app/ui/number-format.ts`, `apps/ui/app/ui/UiNumberField.vue`, `UiColorField.vue`, `UiTextField.vue`
- Test: `apps/ui/test/ui-controls.test.ts`, `apps/ui/test/number-format.test.ts`

**Interfaces:**
- `apps/ui/app/ui/number-format.ts`: `export function numberFormatOptions(integer: boolean): Intl.NumberFormatOptions` → `integer ? { useGrouping: false, maximumFractionDigits: 0 } : { useGrouping: false, maximumSignificantDigits: 17 }` (17 significant digits round-trip every IEEE-754 double, from `Number.MIN_VALUE` to `Number.MAX_VALUE`, and trailing zeros are dropped, so `0.1` still shows as `0.1`).
- `UiNumberField`: props `modelValue: number`, `integer: boolean`, `min?: number`, `max?: number`, `disabled?: boolean`; emits `update:modelValue(number)`. Passes to `NumberFieldRoot`: `step` = `1` when `integer`, else `undefined`; `step-snapping` = `false` unless `integer`; `format-options` = `numberFormatOptions(integer)`; `min`/`max` (reka-ui clamps an out-of-range entry to the bound). Emits only finite values inside `[min, max]` that are whole when `integer`. A rejected update (`null`/`NaN`, e.g. a cleared field) emits nothing and remounts `NumberFieldRoot` (increment its `:key`) so it shows `modelValue` again.
- `UiColorField`: props `modelValue: string` (`#rrggbb`), `disabled?: boolean`; emits `update:modelValue(string)`. Uses `ColorFieldRoot` + `ColorFieldInput`. It records the raw text from the input's native `input` event; on `update:modelValue` it emits the lowercased value only when that value matches `/^#[0-9a-f]{6}$/i` and the recorded raw text (trimmed) is 6 hex digits with optional `#` — so `#112233ff`, which reka-ui normalizes to `#112233`, and `#11223380` both emit nothing.
- `UiTextField`: props `modelValue: string`, `type?: 'text' | 'password'`, `maxlength?: number`, `minlength?: number`, `autocomplete?: string`, `disabled?: boolean`; emits `update:modelValue(string)` on every `input` (v-model semantics, so the secret Set button tracks the typed length) and `commit(string)` on native `change` (plain text settings apply on `commit`, as today); renders `FieldControl`, so it must sit inside a `FieldRoot` (Task 8); `$attrs` on `FieldControl`.

- [ ] **Step 1: Write failing tests:**
  - `number-format.test.ts` (real `Intl.NumberFormat('en-US', numberFormatOptions(false))`, no stub): `1e-21`, `1e-101`, `Number.MIN_VALUE`, `Number.MAX_VALUE`, `1e21`, `0.1`, `1.25`, `0.30000000000000004`, `123456.789012345`, `-2.5e-7` format to a string `s` with `Number(s) === value`; `0.1` formats to exactly `'0.1'`; `numberFormatOptions(true).maximumFractionDigits === 0`.
  - Number: the root gets `step-snapping: false` and `format-options` equal to `numberFormatOptions(false)` for a `number`; `step: 1` and `numberFormatOptions(true)` for an `integer`; `min`/`max` reach the root; reka update `1.25` → emits `1.25`; `0.125` → `0.125`; `does not emit an invalid number` — `NaN`, `null`, `max + 1`, and `2.5` for an integer emit nothing; `restores the last value after an empty entry` — after a `null` update the `NumberFieldRoot` node is a new instance whose `model-value` is the last valid `modelValue`.
  - Color: input text `#11AA33` then update `#11aa33` → emits `#11aa33`; input text `#11223380` then update `#11223380` → nothing; input text `#112233ff` then update `#112233` → nothing; the emitted value passes the board parser (build an appearance with that shadow colour and parse a board).
  - Text: attrs on `FieldControl`; `type="password"` reaches it; an `input` with `'abc'` emits `update:modelValue('abc')` and no `commit`; a `change` with `'Berlin'` emits `commit('Berlin')`.
- [ ] **Step 2: Run** `pnpm -C apps/ui test -- ui-controls number-format` — Expected: FAIL.
- [ ] **Step 3: Implement** `number-format.ts` and the three components with the props above and the shared styles.
- [ ] **Step 4: Run** `pnpm -C apps/ui test -- ui-controls number-format` — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(ui): add reka-ui number, colour and text fields`

### Task 8: `SettingsRow` and the generic settings form

**Files:**
- Create: `apps/ui/app/board/SettingsRow.vue`
- Modify: `apps/ui/app/board/WidgetConfigForm.vue`
- Test: `apps/ui/test/settings-row.test.ts`, `apps/ui/test/config-form.test.ts` (keep its logic tests), new mount tests in `apps/ui/test/widget-config-form.test.ts`

**Interfaces:**
- `SettingsRow`: props `label: string`, `required?: boolean`, `description?: string`, `error?: string | null`, `value?: string` (third column, e.g. `12 px`); default slot = the control. Renders `FieldRoot` > `FieldLabel` (with ` *` + visually hidden ` required` when `required`) + slot + optional `<output>` + `FieldDescription` + `FieldError`. Owns the grid `6.5rem minmax(0, 1fr) auto`, gap `0.5rem`, min-height `1.75rem`, label colour `--ld-text-secondary`.
- `WidgetConfigForm` keeps its props, emits and secret logic; renders each setting in a `SettingsRow`: `select` → `UiSelect`, `checkbox` → `UiSwitch`, `number` → `UiNumberField` (`integer` from `setting.type`), `text` → `UiTextField` (applies on `commit`), secret → `UiTextField type="password"` bound with `v-model` to `passwords[key]` + `UiButton` Set/Clear. Hand-built `aria-describedby` wiring is removed (Field provides it). Existing `settings__*` styles move into `SettingsRow` or are deleted.

- [ ] **Step 1: Write failing tests:** `SettingsRow` renders label, required marker, description and error inside one `FieldRoot`; `WidgetConfigForm` with a schema of string, enum, boolean, integer, number and secret renders exactly `UiTextField`, `UiSelect`, `UiSwitch`, `UiNumberField` (`integer: true`), `UiNumberField` (`integer: false`), `UiTextField` with `type: 'password'`; no `input` host node remains; a `UiSwitch` update emits `change` with the merged config; a text `commit('Berlin')` emits `change` with `city: 'Berlin'`; secret flow — an `update:modelValue` of a key with at least `SECRET_MIN_LENGTH` characters (no `commit`) enables Set, and clicking Set calls `api.setWidgetSecret(widgetId, key, value)` as before.
- [ ] **Step 2: Run** `pnpm -C apps/ui test -- settings-row widget-config-form` — Expected: FAIL.
- [ ] **Step 3: Implement** `SettingsRow` and migrate `WidgetConfigForm`.
- [ ] **Step 4: Run** `pnpm -C apps/ui test` — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(ui): build the widget settings form on reka-ui fields`

### Task 9: Panel structure, Look, reset and the clock editor

**Files:**
- Modify: `apps/ui/app/board/WidgetSettings.vue`, `apps/ui/app/board/WidgetBoard.vue` (props, `changeAppearance`, `resetSettings` copy), `apps/ui/app/widgets/builtin/clocks/analog_1/ClockAnalog1Settings.vue`
- Test: `apps/ui/test/widget-settings-panel.test.ts`, `apps/ui/test/clock-settings.test.ts`, the board test that covers `resetSettings` (find it with `grep -rn "Reset all settings" apps/ui/test`)

**Interfaces:**
- Consumes: `withVariant` (Task 2); `SourceInfo.variants` (Task 3); `Ui*` (Tasks 6–7); `SettingsRow` (Task 8).
- `WidgetSettings` gains prop `variants?: WidgetVariants`; Look is a `UiSelect` with options = item titles and model `resolveVariant(variants, appearance?.variant)`, change → `emit('change', withVariant(appearance, id))`. `WidgetBoard` passes `describeSource(settingsInstance.source)?.variants`.
- Block order: Package (Version `UiSelect`, `UiButton` Apply version, hint) → `Separator` → Appearance (Style, Look, Shadow `UiSwitch`, X/Y/Blur/Opacity `UiSlider` with value column, Color `UiColorField`) → `Separator` → Widget (editor or `WidgetConfigForm`) → `Separator` → Footer (`UiButton` `Reset to defaults`). Package block and its separator only when `versions.length > 0`.
- `resetSettings` confirmation text: `Style, shadow, look and widget options return to their defaults. API keys stay set; use Clear to remove them.`; confirm `Reset`, cancel `Cancel`; behaviour unchanged (`resetWidget`).
- `ClockAnalog1Settings`: `SettingsRow` + `UiSwitch` (System time), `UiRadioGroup` (Notation UTC/GMT), `UiSelect` (Offset, Time zone).

- [ ] **Step 1: Write failing tests** in `widget-settings-panel.test.ts`:
  - `hides Look without variants`; with variants it shows `Look` with titles and the resolved value; `variant: 'gone'` shows the default; picking `roman` emits `change` with `variant: 'roman'` and the same `themeId`/`shadow`.
  - Blocks appear in the order above, separated by `Separator`; no Package block without versions.
  - No `input` host node in the panel; shadow controls are `UiSwitch`, four `UiSlider`, one `UiColorField`.
  - The footer button text is `Reset to defaults`.
  - `panel stays outside widget cards` (board test): the `WidgetSettings` node is not a descendant of any `.board__card`, for an instance with appearance `themeId: 'builtin:bare'` and one with a foreign theme.
  - `reset keeps secrets and clears the look` (board test): after confirming, the instance has no appearance and `config: {}`; `api.clearWidgetSecret` is not called; the confirmation text matches exactly.
  - `clock-settings.test.ts`: the editor renders `UiSwitch`, `UiRadioGroup`, two `UiSelect`, no `input`; existing behaviour tests still pass.
- [ ] **Step 2: Run** `pnpm -C apps/ui test -- widget-settings-panel clock-settings` — Expected: FAIL.
- [ ] **Step 3: Implement** the panel, board wiring and clock editor; delete now-unused `settings__*` styles.
- [ ] **Step 4: Run** `pnpm -C apps/ui test` and `pnpm -C apps/ui typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(ui): one reka-ui settings panel with widget looks`

### Task 10: SDK knowledge for AI authors

**Files:**
- Modify: `packages/create-widget/template/AGENTS.md`, `packages/widget-sdk/docs-src/settings.md`, `design.md`, `api.md`, `index.md`, `packages/widget-sdk/scripts/docs.ts`; regenerate `packages/widget-sdk/docs/`
- Test: `packages/widget-sdk/test/docs.test.ts`, the create-widget template test (find with `grep -rln "AGENTS.md" packages/create-widget/test`)

**Interfaces:**
- Consumes: `VARIANT_LIMITS` (Task 1).
- `docs.ts` adds placeholder `VARIANTS_MAX` = `String(VARIANT_LIMITS.items)`.

- [ ] **Step 1: Write failing tests:** template `AGENTS.md` contains `## Settings and looks` and the phrases `Do not build a settings form`, `Reset to defaults`, `secret`, `variants`, `context.variant`; generated `docs/design.md` contains `## Looks (variants)` and the number `16`; `docs/api.md` context table has a `variant` row with `Since sdk 5`; `docs/index.md` lists `variants`.
- [ ] **Step 2: Run** `pnpm -C packages/widget-sdk test -- docs` and the template test — Expected: FAIL.
- [ ] **Step 3: Write the text** exactly as the spec section «SDK and agent knowledge» lists it: template section with its six bullets and «Workflow step 1 also covers every variant»; `settings.md` sections «Who draws the panel», «Storage and reset», «Settings or state», «Secrets for API keys»; `design.md` «Looks (variants)» with rules (one widget, look only, tokens, `context.variant`, `{{VARIANTS_MAX}}`) and a clock manifest + template snippet switching on `context.variant`; `api.md` row; `index.md` manifest bullet and example. Run `pnpm -C packages/widget-sdk docs`.
- [ ] **Step 4: Run** `pnpm -C packages/widget-sdk test` and the template test — Expected: PASS.
- [ ] **Step 5: Commit** — `docs(widget-sdk): teach settings, reset, secrets and looks`

### Task 11: Reference example — showcase clock with three looks

**Files:**
- Modify: `examples/widgets/showcase-clock/widget.json`, `examples/widgets/showcase-clock/src/*` (component and its styles), regenerated `widget-env.d.ts`
- Test: existing `examples/widgets/showcase-clock` tests (if any) plus a new `src/*.test.ts` only for new logic

**Interfaces:**
- Consumes: `context.variant` typed as `'classic' | 'minimal' | 'roman'` (Tasks 3–4); `context.config.zone`.
- Manifest adds `"variants": { "default": "classic", "items": [{ "id": "classic", "title": "Classic" }, { "id": "minimal", "title": "Minimal" }, { "id": "roman", "title": "Roman numerals" }] }` and `"settings": { "type": "object", "properties": { "zone": { "type": "string", "title": "Time zone", "default": "UTC", "maxLength": 64 } } }`.

- [ ] **Step 1: Write a failing test** for the time-zone logic: `handAngles` (or a new `zonedTime(date, zone)` helper in `src/`) returns the time in `Asia/Tokyo` for a fixed UTC instant and falls back to UTC for an unknown zone.
- [ ] **Step 2: Run** the example's tests — Expected: FAIL.
- [ ] **Step 3: Implement** the helper, the three looks (dial markings and hands differ per `context.variant`, all colours from `--ld-*` tokens) and the manifest change.
- [ ] **Step 4: Set** `version` to `1.1.0` in `widget.json`, then **run** `npx ld-widget check`, `npx ld-widget shot`, `npx ld-widget build` in `examples/widgets/showcase-clock` — Expected: check clean; shots include `6x6-glass-frameless-classic.png`, `-minimal.png`, `-roman.png` and each looks different; build writes `dist/dev.lifedashboard.showcase.clock-1.1.0/`.
- [ ] **Step 5: Commit** — `feat(examples): showcase clock with three looks and a time zone`

### Task 12: Whole-branch verification

- [ ] **Step 1: Run** `pnpm typecheck`, `pnpm test`, `pnpm build` from the worktree root — Expected: all PASS. Record the output.
- [ ] **Step 2: Prepare a throwaway secret package** outside the repository (scratch directory, never committed): `npm create @lifedashboard/widget "Secret probe"`, then in its `widget.json` set `permissions: ["network"]`, `network: ["http://127.0.0.1:8787"]`, `settings` with `apiKey: { "type": "secret", "title": "API key", "bind": { "origin": "http://127.0.0.1:8787", "header": "X-Api-Key" } }` and `refresh: { "type": "number", "title": "Refresh", "default": 1.5, "minimum": 0.5, "maximum": 60 }`; build it.
- [ ] **Step 3: Manual check in Orca's built-in browser** (`orca-cli`), `pnpm dev`: import the built showcase clock (1.1.0) and the secret probe. For each screen theme (Glass, Obsidian, Paper) open the clock's settings with widget style «No frame» and with another theme — the panel follows the screen theme; Look switches the face live; switch, slider, colour, select and text controls work by mouse and keyboard; installing showcase clock 1.0.0 and switching to it hides Look. On the secret probe: type a dummy key (≥ `SECRET_MIN_LENGTH` characters) — Set becomes enabled while typing; Set shows «set»; `refresh` keeps decimals (enter `1.25`, and `12.345678901234567`, blur, reload: the same value is shown and stored), clamps `100` to `60`, and a cleared field shows the last value after blur; Reset to defaults restores style, shadow, look and plain settings while the key stays «set».
- [ ] **Step 4: Report** results, deviations and open findings in the final report; request the Opus 5.5 whole-branch review.

### Task 13: Review fixes and the colour picker (revision 2026-10-28)

Added after the whole-branch review, per the spec section «Revision 2026-10-28». All steps are done.

- [x] **Panel fixes:** leave out the Widget block without settings (test `leaves out the Widget block when the widget has no settings`); one separator above the form; a fixed value column so slider tracks align; compact `showcase-clock/widget.json`; looks in the docs index. Commit `fix(ui): hide the empty Widget block and align settings rows`.
- [x] **`color` setting type:** contracts (`PlainSettingType`, `isValidSettingValue`, `controlFor` → `color`, sdk 5 gate), `WidgetConfigForm` row with `UiColorField`, native colour input in the dev shell, docs and template. Tests in `widget-settings.test.ts`, `widget-package.test.ts`, `widget-config-form.test.ts`, `config-declaration.test.ts`. Commit `feat: add color settings drawn with the colour picker`.
- [x] **Colour picker:** `UiColorField` swatch → `Popover` with `ColorArea` (hsb saturation × brightness) and hue `ColorSlider`; optional `alpha` model with an opacity `ColorSlider`; checkerboard under the swatch; shadow opacity bound to `alpha`, the Opacity row removed. Tests in `ui-controls.test.ts` and `widget-settings-panel.test.ts`. Commit `feat(ui): open a reka-ui colour picker with hue and opacity from the swatch`.
- [x] **Verification:** `pnpm typecheck` and `pnpm test` pass (contracts 653, widget-sdk 400, ui 802, api 405, create-widget 51, examples pass); Orca browser check of the panel, looks, reset and the picker on an isolated dev instance.
