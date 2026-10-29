# Widget content scale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user set a per-widget text size from −50 % to +50 %, applied to `em`-sized content in built-in and sandboxed widgets.

**Architecture:** `WidgetAppearance` gains an integer `scale`. The host turns it into an inline `--ld-content-scale` on the widget frame root, and `.widget__body` multiplies its font size by it. Sandboxed widgets get the factor as `WidgetContext.contentScale`; the SDK runtime sets the same variable on the frame root and sizes `body` through a rule in `@layer ld.base`, so widget CSS keeps priority.

**Tech Stack:** TypeScript (strict), Vue 3 / Nuxt 4, reka-ui (`UiNumberField`), UnoCSS, Fastify, SQLite, Vitest, pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-10-29-widget-content-scale-design.md`

## Global Constraints

- Branch `feat/widget-content-scale`, based on `feat/theme-fonts`.
- `scale`: integer in `SCALE_LIMITS = [-50, 50]`; `null` means 0; `normalizeAppearance` stores 0 as `null`. Key order: `theme, shadow, variant, scale`.
- Factor = `1 + scale / 100`; `WidgetContext.contentScale` is that factor, 1 by default, `@since sdk 6`.
- Host formula: `.widget__body { font-size: calc(var(--ld-font-scale) * var(--ld-content-scale, 1) * 1rem) }`.
- Sandbox rule: `@layer ld.base { body.ld-content { font-size: calc(var(--ld-font-scale, 1) * var(--ld-content-scale, 1) * 1rem) } }`; never an inline `font-size` on `body`.
- A widget modal always gets `contentScale: 1`.
- `SDK_LEVELS = [1, 2, 3, 4, 5, 6]`, `SDK_TARGET_LEVEL = 6`.
- Settings copy: row label `Text size, %`; reset confirmation `Style, shadow, look, text size and widget options return to their defaults. API keys stay set; use Clear to remove them.`
- No new dependencies, no DB migration.
- Commit messages: `type(scope): subject`, at most a two-line body, no attribution trailers.

## Review Focus

1. A board saved before this change (appearance JSON without `scale`) loads, saves back and compares equal (`isSameBoard`) without a spurious dirty state. Tests in Task 1.
2. Changing the style, shadow or look of a scaled widget keeps its scale. Test in Task 2.
3. Changing only the scale of an open sandbox widget updates it live without reloading the iframe. Test in Task 3 (context), manual check in Task 6.
4. An old package whose CSS sets `body { font-size: 0.75em }` renders unchanged at factor 1. Rule placement test in Task 3, manual check in Task 6.
5. The widget modal of a scaled widget stays at factor 1. Test in Task 3.

---

### Task 1: Stored `scale` in widget appearance

**Files:**
- Modify: `packages/contracts/src/board.ts`, `apps/api/src/spaces.ts`
- Test: `packages/contracts/test/board.test.ts` (`describe('widget appearance')`), `apps/api/test/spaces.test.ts`; existing expectations of a three-field appearance in `apps/ui/test/widget-settings.test.ts`, `widget-settings-panel.test.ts`, `edit-session.test.ts`, `theme-resolve.test.ts` and any other file `pnpm typecheck` or `pnpm -C apps/ui test` flags

**Interfaces:**
- Produces: `WidgetAppearance { theme; shadow; variant; scale: number | null }`; `export const SCALE_LIMITS = [-50, 50] as const`; `normalizeAppearance` returns `undefined` when all four fields are `null` and maps `scale: 0` to `null`.

- [ ] **Step 1: Write failing tests** in `board.test.ts`, with the file's `withLook` and `first` helpers:

```ts
it.each([-50, 50, 12])('keeps scale %d', (scale) => {
  expect(first(withLook({ theme: 'bare', shadow: null, variant: null, scale })).appearance)
    .toStrictEqual({ theme: 'bare', shadow: null, variant: null, scale })
})
it('reads a missing or zero scale as null and keeps the rest', () => {
  const expected = { theme: 'bare', shadow: null, variant: null, scale: null }
  expect(first(withLook({ theme: 'bare', shadow: null, variant: null })).appearance).toStrictEqual(expected)
  expect(first(withLook({ theme: 'bare', shadow: null, variant: null, scale: 0 })).appearance).toStrictEqual(expected)
})
it('omits an appearance whose fields are all empty', () => {
  expect(first(withLook({ theme: null, shadow: null, variant: null, scale: 0 }))).not.toHaveProperty('appearance')
  expect(first(withLook({ theme: null, shadow: null, variant: null, scale: null }))).not.toHaveProperty('appearance')
})
it('orders scale last', () => {
  expect(Object.keys(first(withLook({ scale: 5, variant: null, shadow: null, theme: 'bare' })).appearance!)).toEqual(['theme', 'shadow', 'variant', 'scale'])
})
```

Add `51`, `-51`, `1.5` and `'10'` as `scale` cases to the existing `rejects %s` table (`invalid widget appearance`). Update the existing expectations that list an appearance object to include `scale: null`.

In `spaces.test.ts`, next to `reads an appearance row without a theme with variant null`:
- a board whose instance appearance has `scale: 20` saves and loads unchanged;
- a stored row `JSON.stringify({ theme: 'bare', shadow: null, variant: null })` loads as `{ theme: 'bare', shadow: null, variant: null, scale: null }`.

- [ ] **Step 2: Run** `pnpm -C packages/contracts test` and `pnpm -C apps/api test`. Expected: FAIL in the new cases.
- [ ] **Step 3: Implement.** In `board.ts`: the `scale` field and `SCALE_LIMITS`; `parseAppearance` reads `raw.scale ?? null` and rejects anything that is not an integer within the limits; `normalizeAppearance` adds `scale` last. In `spaces.ts`, the row read adds `scale: parsed.scale ?? null` beside `variant`. Fix other compile errors from the new required field (`edit-session.ts` `addInstance` literal, `widget-settings.ts` helpers) with `scale: null` only; Task 2 gives the helpers their behaviour. Update the UI test fixtures and expectations listed under Files mechanically with `scale: null`; no other UI behaviour changes here.
- [ ] **Step 4: Run** `pnpm -C packages/contracts test`, `pnpm -C apps/api test`, `pnpm -C apps/ui test`, `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(contracts): per-widget content scale in widget appearance`

---

### Task 2: Apply the scale in the host

**Files:**
- Modify: `apps/ui/app/board/widget-settings.ts`, `apps/ui/app/widgets/WidgetFrame.vue`, `apps/ui/app/widgets/WidgetHost.vue`, `apps/ui/app/board/WidgetBoard.vue`, `apps/ui/app/theme/styles/frame.css`, `apps/ui/app/widgets/builtin/PlaceholderWidget.vue`
- Test: `apps/ui/test/widget-settings.test.ts`, `apps/ui/test/widget-host.test.ts`, `apps/ui/test/theme-content.test.ts`

**Interfaces:**
- Consumes: `WidgetAppearance.scale` (Task 1).
- Produces: `withScale(appearance: WidgetAppearance | undefined, scale: number): WidgetAppearance`; `WidgetFrame` and `WidgetHost` prop `scale?: number | null`.

- [ ] **Step 1: Write failing tests.**

`widget-settings.test.ts`:

```ts
describe('withScale', () => {
  it('stores 0 as null and keeps the other fields', () => {
    const look = { theme: 'bare' as const, shadow: DEFAULT_SHADOW, variant: 'roman', scale: 10 }
    expect(withScale(look, 0)).toStrictEqual({ ...look, scale: null })
    expect(withScale(undefined, -20)).toStrictEqual({ theme: null, shadow: null, variant: null, scale: -20 })
  })
  it('keeps the scale when style, shadow or look change', () => {
    const look = { theme: null, shadow: null, variant: null, scale: 30 }
    expect(withStyle(look, 'bare').scale).toBe(30)
    expect(withShadow(look, DEFAULT_SHADOW).scale).toBe(30)
    expect(withVariant(look, 'roman').scale).toBe(30)
  })
})
```

`widget-host.test.ts`, beside `puts the theme font variables on the root widget element`:
- `{ themeId, fonts, scale: 20 }` gives the root style `{ ...fonts, '--ld-content-scale': '1.2' }`;
- `scale: 0`, `null` or absent with no fonts gives no `--ld-content-scale`.

`theme-content.test.ts`:
- `frame.css` `.widget__body` has `font-size: calc(var(--ld-font-scale) * var(--ld-content-scale, 1) * 1rem)`;
- `PlaceholderWidget.vue` has no `text-2xl` and its style declares `font-size: 1.5em` and `line-height: calc(4 / 3)`.

- [ ] **Step 2: Run** `pnpm -C apps/ui test`. Expected: FAIL in the new cases.
- [ ] **Step 3: Implement.**
  - `withScale` in `widget-settings.ts`; `withStyle`, `withShadow` and `withVariant` copy `appearance?.scale ?? null`.
  - `WidgetFrame`: a computed root style merging `fonts` and `'--ld-content-scale': String(1 + scale / 100)` when `scale` is a non-zero number; `undefined` when empty.
  - `WidgetHost` passes `scale` to `WidgetFrame`.
  - `WidgetBoard` passes `:scale="instance.appearance?.scale ?? null"`; the build draft passes nothing.
  - `frame.css` formula.
  - `PlaceholderWidget`: drop `text-2xl`, add a scoped `font-size: 1.5em; line-height: calc(4 / 3)`.
- [ ] **Step 4: Run** `pnpm -C apps/ui test` and `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(ui): scale widget content in the host frame`

---

### Task 3: `contentScale` in the widget context and the sandbox runtime

**Files:**
- Modify: `packages/contracts/src/widget-gateway.ts`, `apps/ui/app/widgets/context.ts`, `apps/ui/app/widgets/WidgetHost.vue`, `apps/ui/app/widgets/modals.ts`, `packages/widget-sdk/src/sandbox.ts`, `packages/widget-sdk/src/dev/shell-state.ts`
- Test: `apps/ui/test/widget-context.test.ts`, `apps/ui/test/widget-host.test.ts`, `packages/widget-sdk/test/sandbox-root.test.ts`, `packages/widget-sdk/test/shell-state.test.ts`, `packages/widget-sdk/test/build.test.ts`, `packages/contracts/test/widget-package.test.ts`; regenerated `packages/widget-sdk/docs/*`; every `WidgetContext` literal that typecheck flags (`packages/contracts/test/widget-modal.test.ts`, `packages/widget-sdk/test/widget.test.ts`, `apps/ui/test/widget-modal-controller.test.ts`, …) gets `contentScale: 1`

**Interfaces:**
- Consumes: `WidgetHost` prop `scale` (Task 2).
- Produces: `WidgetContext.contentScale: number`; `useWidgetContext` source `contentScale: () => number`; `SDK_LEVELS` with 6, `SDK_TARGET_LEVEL = 6`.

- [ ] **Step 1: Write failing tests.**
  - `widget-context.test.ts`: a source `contentScale: () => factor.value` starts the context at `1.2` and follows a change to `0.5` after `nextTick`. Add `contentScale: () => 1` to the other `useWidgetContext` calls.
  - `widget-context.test.ts`, in `copies theme, config, locale, secret flags and root font size to the modal…`: a caller context with `contentScale: 1.3` gives the modal context `contentScale: 1`.
  - `widget-host.test.ts`, with the existing `surfaceFixture`: a real `WidgetHost` mounted with `scale: 30` passes a context with `contentScale: 1.3` to `SandboxWidget`.
  - `sandbox-root.test.ts`: the runtime context fixture gets `contentScale: 1.5`; the root style has `--ld-content-scale` `1.5` and follows a context patch to `0.8`; the prepended style text matches `/@layer ld\.base\s*\{\s*body\.ld-content\s*\{\s*font-size: calc\(var\(--ld-font-scale, 1\) \* var\(--ld-content-scale, 1\) \* 1rem\)/`; `body.style.fontSize` stays `''`.
  - `shell-state.test.ts`: `shellContext(...)` returns `contentScale: 1`.
  - `build.test.ts`: the built manifest has `sdk: 6`.
  - `widget-package.test.ts`: a manifest with `sdk: 6` parses; `rejects a newer sdk level with an update hint` and `checks sdk before unknown fields` use `sdk: 7` and expect `manifest.sdk 7 needs a newer LifeDashboard (this one supports 1–6)`.
- [ ] **Step 2: Run** `pnpm -C apps/ui test` and `pnpm -C packages/widget-sdk test`. Expected: FAIL in the new cases.
- [ ] **Step 3: Implement.**
  - `widget-gateway.ts`: the field with JSDoc `The user's text size for this widget as a factor, 0.5–1.5. @since sdk 6`; the SDK levels.
  - `context.ts`: initial `contentScale: source.contentScale()` and a watch on `source.contentScale`, like `variant`.
  - `WidgetHost`: `contentScale: () => 1 + (props.scale ?? 0) / 100`.
  - `modals.ts` `context()`: `{ ...effective, frame: 'frameless', contentScale: 1, visible: … }`.
  - `sandbox.ts`: append the Global Constraints sandbox rule after `contentCss` in the injected style; in the existing `watchEffect`, `root.style.setProperty('--ld-content-scale', String(context.contentScale))`.
  - `shell-state.ts`: `contentScale: 1`.
  - Run `pnpm -C packages/widget-sdk run docs`: the generated pages embed `SDK_TARGET_LEVEL` and `SDK_LEVELS`, and `docs.test.ts` requires `docs/` to match a fresh generation. Commit the regenerated pages.
- [ ] **Step 4: Run** `pnpm -C packages/contracts test`, `pnpm -C apps/ui test`, `pnpm -C packages/widget-sdk test`, `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(widget-sdk): content scale in the widget context and sandbox runtime`, including the regenerated `packages/widget-sdk/docs/*`.

---

### Task 4: Settings row and reset copy

**Files:**
- Modify: `apps/ui/app/board/WidgetSettings.vue`, `apps/ui/app/board/WidgetBoard.vue`
- Test: `apps/ui/test/widget-settings-panel.test.ts`, `apps/ui/test/widget-settings-board.test.ts`

**Interfaces:**
- Consumes: `withScale` (Task 2), `SCALE_LIMITS` (Task 1).

- [ ] **Step 1: Write failing tests.**
  - The settings panel renders a `Text size, %` row with an integer `UiNumberField` bounded by `SCALE_LIMITS`, showing `appearance.scale ?? 0`, for a framed and a bare widget. Entering `25` emits `change` with `scale: 25`; entering `0` emits `scale: null`.
  - `widget-settings-board.test.ts`: the `confirmation` constant becomes the Global Constraints copy; `resetWidget` on an instance with `scale: 40` removes its appearance.
- [ ] **Step 2: Run** `pnpm -C apps/ui test`. Expected: FAIL in the new cases.
- [ ] **Step 3: Implement** the spec's `SettingsRow` after the shadow controls, with `:min="SCALE_LIMITS[0]" :max="SCALE_LIMITS[1]"`, and the new confirmation copy in `WidgetBoard.resetSettings`.
- [ ] **Step 4: Run** `pnpm -C apps/ui test` and `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(ui): text size setting in the widget panel`

---

### Task 5: Documentation

**Files:**
- Modify: `packages/widget-sdk/docs-src/api.md`, `packages/widget-sdk/docs-src/design.md`, `packages/widget-sdk/docs-src/index.md`, `packages/create-widget/skill/lifedashboard-widget/SKILL.md`, `README.md`; regenerated `packages/widget-sdk/docs/*`
- Test: `packages/widget-sdk/test/docs.test.ts`

- [ ] **Step 1: Write failing tests** in `docs.test.ts`:

```ts
expect(docs.get('api.md')).toMatch(/\| `contentScale` \| .*Since sdk 6/)
expect(docs.get('api.md')).toContain('Level 6: `context.contentScale`')
expect(docs.get('design.md')).toContain('var(--ld-content-scale)')
expect(docs.get('design.md')).toContain('150 %')
```
- [ ] **Step 2: Run** `pnpm -C packages/widget-sdk test`. Expected: FAIL.
- [ ] **Step 3: Write** the spec's «SDK and documentation» text: the `contentScale` row after `rootFontSize`; `Level 6` in «sdk levels»; the scale paragraph in «em, rem and rootFontSize»; `contentScale` next to `rootFontSize` in the `index.md` and `SKILL.md` design summaries; one README line on the per-widget text size. Run `pnpm -C packages/widget-sdk run docs`.
- [ ] **Step 4: Run** `pnpm -C packages/widget-sdk test`, `pnpm -C packages/create-widget test` and `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `docs: widget content scale`

---

### Task 6: Whole-branch verification

**Files:** none changed unless a check fails; a fix goes back to the owning task's files.

- [ ] **Step 1:** Run `pnpm typecheck`, `pnpm test`, `pnpm build` at the repository root. Expected: exit 0 each. Record test counts.
- [ ] **Step 2:** In the Orca browser (`orca-cli`) on an isolated dev instance with a scratch database:
  - build a temporary local sandbox widget (not committed) with a `<p>` sized by inheritance and a `<h2>`; the example widgets size their text in `rem`/`px` and cannot show the scale;
  - at a 16px root, scale −50, 0 and +50: the placeholder text is 12 / 24 / 36px, the temporary widget's `<p>` is 8 / 16 / 24px and its `<h2>` follows `--ld-size-h2` the same way;
  - changing the scale of the open temporary widget applies live, without an iframe reload;
  - a widget modal of a scaled widget stays at factor 1;
  - add `body { font-size: 0.75em }` to the temporary widget: its `<p>` is 12px at factor 1 and stays 12px at +50;
  - `Reset to defaults` returns the field to 0;
  - reload the page: the scale persists.
- [ ] **Step 3:** Report results, deviations and anything unverified.
