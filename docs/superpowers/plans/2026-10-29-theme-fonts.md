# Theme fonts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user pick a heading and a body font from 12 self-hosted Google Fonts families as part of the theme choice, rendered in the host and in sandboxed SDK widgets.

**Architecture:** `ThemeChoice` gains optional `heading`/`body` slugs. A one-off script downloads WOFF2 files and licences and generates `fonts.css`; everything is committed. The host imports `fonts.css` through Vite and applies the chosen stacks as inline custom properties on `.space` and each widget frame root; the sandbox gets the values through `context.theme.tokens` and the `@font-face` rules from the SDK runtime, which loads files from a new API route.

**Tech Stack:** TypeScript (strict), Vue 3 / Nuxt 4, reka-ui (`UiSelect`), Fastify, Vitest 5, Node 24 (`fetch`, runs `.ts` directly), pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-10-29-theme-fonts-design.md`

## Global Constraints

- Font slug: `^[a-z][a-z0-9-]{0,31}$`. «Theme default» is an absent key; `null` is invalid. Emitted key order: `palette, mode, style, heading, body`.
- Catalog, in this order: `inter` Inter, `golos-text` Golos Text, `onest` Onest, `manrope` Manrope, `montserrat` Montserrat, `nunito` Nunito, `rubik` Rubik (fallback `sans-serif`); `unbounded` Unbounded (`sans-serif`); `lora` Lora, `literata` Literata, `playfair-display` Playfair Display, `eb-garamond` EB Garamond (`serif`).
- Subsets: `latin` and `cyrillic` only. Upright only.
- Stack format: `'<Name>', system-ui, <fallback>`.
- `heading` sets `--ld-font-heading` and `--ld-font-display`; `body` sets `--ld-font-body` and `--ld-font-ui`.
- Fonts never change the combination id or `foreign`.
- Files: `apps/ui/app/theme/fonts/<slug>-<subset>.woff2`, `apps/ui/app/theme/fonts/<slug>.OFL.txt`, `apps/ui/app/theme/styles/fonts.css`.
- `fonts.ts` is imported by a Node script: relative imports inside it use `.ts` specifiers.
- No new dependencies. Normal builds and tests never touch the network; only `fetch:fonts` does.
- Picker copy: `Heading font`, `Body font`, `Theme default`; sample lines `Heading Заголовок` and `Body text Текст 123`.
- Commit messages: `type(scope): subject`, at most a two-line body, no attribution trailers.

## Review Focus

1. A stored choice with an unknown font slug (`heading: 'comic'`) renders the theme default, the picker shows `Theme default`, and changing mode or style keeps the stored slug. Tests in Task 2 (`fontVars`) and Task 4 (picker).
2. An old client or old stored row without font keys stays valid everywhere. Tests in Task 1.
3. A widget with its own palette and no fonts on a board with fonts renders the system fonts, not the board's. Test in Task 3.
4. Changing only a font while a sandbox widget is open updates its tokens. Test in Task 3.
5. A desktop bundle without the font files or licences fails the bundle smoke instead of shipping silently. Check in Task 5.

---

### Task 1: Font keys in `ThemeChoice`

**Files:**
- Modify: `packages/contracts/src/theme.ts`
- Test: `packages/contracts/test/theme.test.ts`, `packages/contracts/test/board.test.ts`, `packages/contracts/test/space.test.ts`

**Interfaces:**
- Produces: `ThemeChoice { palette; mode; style; heading?: string; body?: string }`; `isThemeChoice` accepts the optional keys.

- [ ] **Step 1: Write failing tests** in `theme.test.ts`:

```ts
const base = { palette: 'builtin:gruvbox', mode: 'dark', style: 'solid' }
it('accepts optional heading and body slugs', () => {
  expect(isThemeChoice({ ...base, heading: 'unbounded', body: 'inter' })).toBe(true)
  expect(isThemeChoice({ ...base, body: 'golos-text' })).toBe(true)
  expect(isThemeChoice(base)).toBe(true)
})
it.each([null, 'Inter', 'inter ', '', 7, 'a'.repeat(33)])('rejects font value %j', (value) => {
  expect(isThemeChoice({ ...base, heading: value })).toBe(false)
  expect(isThemeChoice({ ...base, body: value })).toBe(false)
})
it('rejects keys other than the five', () => {
  expect(isThemeChoice({ ...base, mono: 'inter' })).toBe(false)
})
```

In `board.test.ts`: a screen with `theme: { ...base, heading: 'lora' }` parses unchanged; an instance appearance `{ theme: { ...base, body: 'Inter' }, shadow: null }` fails with `invalid widget appearance`. In `space.test.ts`: `parseSpacePatch({ theme: { ...base, heading: null } })` fails with `invalid space theme`.

- [ ] **Step 2: Run** `pnpm -C packages/contracts test`. Expected: FAIL in the new cases.
- [ ] **Step 3: Implement.** `isThemeChoice` checks that every key is one of the five, the three required ones are valid, and each present font key matches the slug pattern. Reuse one slug regex for palette suffix and fonts.
- [ ] **Step 4: Run** `pnpm -C packages/contracts test` and `pnpm -C packages/contracts typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(contracts): optional heading and body fonts in ThemeChoice`

---

### Task 2: Catalog, fetch script and committed font files

**Files:**
- Create: `apps/ui/app/theme/fonts.ts`, `apps/ui/scripts/fetch-fonts.ts`, `apps/ui/app/theme/fonts/*` (script output), `apps/ui/app/theme/styles/fonts.css` (script output)
- Modify: `apps/ui/package.json` (script `"fetch:fonts": "node scripts/fetch-fonts.ts"`), `apps/ui/app/theme/styles/layers.css` (`@import './fonts.css';` before the layered imports, outside any layer)
- Test: `apps/ui/test/theme-fonts.test.ts` (new)

**Interfaces:**
- Produces (`fonts.ts`):
  - `interface FontFamily { slug: string; name: string; fallback: 'sans-serif' | 'serif'; weight: [min: number, max: number] }`
  - `BUILTIN_FONTS: readonly FontFamily[]` (Global Constraints order), `BUILTIN_FONT_SLUGS: ReadonlySet<string>`
  - `fontStack(font: FontFamily): string`
  - `fontVars(choice: ThemeChoice | null | undefined): Record<string, string>` — entries only for known slugs.
  - `withFont(choice: ThemeChoice, key: 'heading' | 'body', slug: string | null): ThemeChoice` — `null` removes the key; result keys in the canonical order.

- [ ] **Step 1: Write failing tests** in `theme-fonts.test.ts`:
  - For every `BUILTIN_FONTS` entry, `<slug>-latin.woff2`, `<slug>-cyrillic.woff2` and `<slug>.OFL.txt` exist in `app/theme/fonts/`, and no other file is there.
  - Parse `fonts.css` with postcss: exactly `BUILTIN_FONTS.length * 2` `@font-face` rules; each has `font-family` equal to the quoted catalog name, `font-weight` `<min> <max>` from the catalog, `font-display: swap`, a `unicode-range`, and `src` `url(../fonts/<slug>-<subset>.woff2) format('woff2')`.
  - `fontStack(inter)` is `'Inter', system-ui, sans-serif`; for every font, a generated combination whose `--ld-font-body` and `--ld-font-heading` are replaced by `fontStack(font)` still passes `validateThemeCss`.
  - `fontVars({ ...base, heading: 'unbounded', body: 'inter' })` equals the four variables with those stacks; `fontVars({ ...base, heading: 'comic' })` and `fontVars(null)` equal `{}`.
  - `withFont({ ...base, body: 'inter' }, 'heading', 'lora')` has keys `['palette','mode','style','heading','body']`; `withFont(..., 'body', null)` has no `body`.

- [ ] **Step 2: Run** `pnpm -C apps/ui test -- theme-fonts`. Expected: FAIL (module and files missing).

- [ ] **Step 3: Implement `fonts.ts`.** Fill `weight` from each family's Google Fonts metadata (`https://fonts.google.com/metadata/fonts` or `google/fonts` `METADATA.pb`); record the check date in a comment.

- [ ] **Step 4: Implement `scripts/fetch-fonts.ts`** per the spec section «Fetch script». It keeps the faces under the `/* latin */` and `/* cyrillic */` comments, throws `<Name>: missing <subset> subset` or `<Name>: HTTP <status> <url>`, writes into a temporary directory and replaces `app/theme/fonts/` and `fonts.css` only after every family succeeded. OFL path: `ofl/<name lower-cased, spaces removed>/OFL.txt`.

- [ ] **Step 5: Run** `pnpm -C apps/ui fetch:fonts`, then `pnpm -C apps/ui test -- theme-fonts`. Expected: PASS. Record the total size of `app/theme/fonts/*.woff2` (`du -ch`) in the task report. If a family lacks `cyrillic`, stop and report it: the catalog is a user decision.

- [ ] **Step 6: Run** `pnpm -C apps/ui build`. Expected: exit 0, and `.output/public/_nuxt/` contains the 24 fingerprinted `.woff2` files.

- [ ] **Step 7: Commit** `feat(ui): self-hosted font catalog with latin and cyrillic files`

---

### Task 3: Apply fonts in the host and follow changes in widgets

**Files:**
- Modify:
  - `apps/ui/app/theme/resolve.ts` — `resolveWidgetLook(appearance, boardThemeId, scheme, boardChoice)`;
  - `apps/ui/app/widgets/WidgetFrame.vue` — prop `fonts?: Record<string, string>`, bound as `:style` on the root `.widget`;
  - `apps/ui/app/widgets/WidgetHost.vue` — prop `fonts?`, passed to the frame and to `useWidgetContext`;
  - `apps/ui/app/widgets/context.ts` — source gains `fonts: () => string`; watch `[themeId, foreign, fonts]`;
  - `apps/ui/app/board/WidgetBoard.vue` — pass `props.themeChoice` to `resolveWidgetLook`, `:fonts="look.fonts"`; the build draft gets `:fonts="fontVars(themeChoice)"`;
  - `apps/ui/app/app.vue` — `.space` root `:style="fontVars(boardTheme)"`.
- Test: `apps/ui/test/theme-resolve.test.ts`, `apps/ui/test/widget-context.test.ts`, `apps/ui/test/widget-host.test.ts`, `apps/ui/test/app-theme.test.ts`

**Interfaces:**
- Consumes: `fontVars` (Task 2).
- Produces: `resolveWidgetLook(...): { themeId: string; skin: FrameSkin; foreign: boolean; fonts: Record<string, string> }`.

- [ ] **Step 1: Write failing tests:**
  - `theme-resolve.test.ts` with `board = { palette: 'builtin:gruvbox', mode: 'dark', style: 'glass', heading: 'unbounded', body: 'inter' }`:
    - an appearance with `theme: null`, or `undefined`, or `'bare'` returns `fonts` equal to `fontVars(board)`;
    - an appearance with its own `{ palette: 'builtin:catppuccin', mode: 'dark', style: 'solid' }` returns `fonts: {}` (Review Focus 3);
    - an own choice with `body: 'lora'` returns only the body variables;
    - an own choice with an unknown palette inherits the board fonts.
  - `widget-context.test.ts`: with a reactive `fonts` ref and a frame stub whose computed `--ld-font-heading` follows it, changing only `fonts` updates `context.theme.tokens['--ld-font-heading']` after `nextTick` with the same `id`, and resetting it to `''` updates it again (Review Focus 4).
  - `widget-host.test.ts`: mounting `WidgetFrame` with `fonts: { '--ld-font-body': "'Inter', system-ui, sans-serif" }` puts the variable in the root `.widget` element's `style`, not on `.widget__wrapper`.
  - `app-theme.test.ts`: a space choice with `heading: 'lora'` gives the root element a `style` containing `--ld-font-heading: 'Lora', system-ui, serif`.

- [ ] **Step 2: Run** `pnpm -C apps/ui test -- theme-resolve widget-context widget-host app-theme`. Expected: FAIL.
- [ ] **Step 3: Implement** the Interfaces. `WidgetHost` passes `fonts: () => JSON.stringify(props.fonts ?? {})`.
- [ ] **Step 4: Run** `pnpm -C apps/ui test` and `pnpm -C apps/ui typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(ui): apply theme fonts to spaces and widget frames`

---

### Task 4: Font rows in `ThemePicker`

**Files:**
- Modify: `apps/ui/app/theme/ThemePicker.vue`
- Test: `apps/ui/test/theme-picker.test.ts`

**Interfaces:**
- Consumes: `BUILTIN_FONTS`, `BUILTIN_FONT_SLUGS`, `fontStack`, `withFont` (Task 2); `UiSelect` (`modelValue: string`, `options: { value, label }[]`, `disabled`; `''` is a valid option value).

- [ ] **Step 1: Write failing tests** (existing `compileSfc`/`mountComponent` helpers, `UiSelect` compiled as in the file's other tests):
  - With `modelValue` `{catppuccin, dark, glass}`, choosing `Unbounded` in `Heading font` emits `{ palette: 'builtin:catppuccin', mode: 'dark', style: 'glass', heading: 'unbounded' }` with that key order.
  - With `heading: 'unbounded'`, choosing `Theme default` emits the choice without `heading`.
  - Both selects list `Theme default` plus the 12 names in catalog order.
  - With `null` (inherit) or `'bare'`, both selects are disabled.
  - With `heading: 'comic'`, the heading select shows `Theme default`, and choosing Style `Solid` emits a choice that still has `heading: 'comic'` (Review Focus 1).
  - From Inherit with `inherited` `{gruvbox, light, solid, heading: 'lora'}`, clicking the Catppuccin tile emits a choice with `heading: 'lora'`.
  - The sample element shows `Heading Заголовок` with `font-family` equal to `fontStack(unbounded)` for `heading: 'unbounded'`, and `system-ui, sans-serif` when absent.
- [ ] **Step 2: Run** `pnpm -C apps/ui test -- theme-picker`. Expected: FAIL.
- [ ] **Step 3: Implement.** Two rows below Style, each a `<label>` naming a `UiSelect` (`''` = `Theme default`); values pass through `withFont(selected, key, value || null)`. The select value is the stored slug when known, else `''`. The sample uses the effective choice.
- [ ] **Step 4: Run** `pnpm -C apps/ui test -- theme-picker settings-panel screen-dots widget-settings-panel ui-select`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(ui): pick heading and body fonts in the theme picker`

---

### Task 5: API font route, document cache and desktop bundle

**Files:**
- Modify: `apps/api/src/sandbox.ts`, `apps/ui/app/widgets/SandboxWidget.vue` (`:src` gets `?doc=2`), `apps/api/scripts/copy-runtime.mjs`, `apps/api/scripts/smoke-bundle.mjs`
- Test: `apps/api/test/sandbox.test.ts`, `apps/ui/test/widget-host.test.ts` (iframe `src`)

**Interfaces:**
- Produces: `GET /sandbox/runtime/fonts/:file` (Task 6 builds URLs against it).

- [ ] **Step 1: Write failing tests** in `sandbox.test.ts`:
  - `GET /sandbox/runtime/fonts/inter-latin.woff2` → 200, `content-type: font/woff2`, `cache-control: no-cache`, `access-control-allow-origin: *`, body equals the file from `apps/ui/app/theme/fonts/`.
  - With `runtimeDir` (the existing `testApp(undefined, { runtimeDir })` pattern), the route serves `<runtimeDir>/fonts/x-latin.woff2`.
  - 404 for `..%2Fsandbox.ts`, `Inter-latin.woff2`, `inter.ttf`, `missing-latin.woff2`.
  - The sandbox document test at the existing `IMMUTABLE` assertion now expects `no-cache`; package files keep `IMMUTABLE`.
  - `widget-host.test.ts`: the rendered iframe `src` is `/sandbox/packages/<hash>/?doc=2`.
- [ ] **Step 2: Run** `pnpm -C apps/api test -- sandbox` and `pnpm -C apps/ui test -- widget-host`. Expected: FAIL.
- [ ] **Step 3: Implement.** The route validates `^[a-z0-9-]+\.woff2$`, reads from `join(config.runtimeDir, 'fonts')` or `fileURLToPath(new URL('../../ui/app/theme/fonts/', import.meta.url))`. The document route uses `cache-control: no-cache`. `copy-runtime.mjs` copies `*.woff2` and `*.OFL.txt` into `dist-bundle/runtime/fonts/`. `smoke-bundle.mjs` also requests `/sandbox/runtime/fonts/inter-latin.woff2` and fails unless every source `*.woff2` and `*.OFL.txt` exists in `runtime/fonts/` (Review Focus 5).
- [ ] **Step 4: Run** `pnpm -C apps/api test`, `pnpm -C apps/api typecheck`, then `pnpm -C apps/api run build:bundle` (includes `copy-runtime`) and `pnpm -C apps/api run smoke:bundle`. Expected: PASS and `200 /sandbox/runtime/fonts/inter-latin.woff2` in the smoke output.
- [ ] **Step 5: Commit** `feat(api): serve sandbox fonts and stop caching sandbox documents forever`

---

### Task 6: Sandbox CSP and runtime `@font-face`

**Files:**
- Modify: `packages/contracts/src/sandbox-document.ts`, `packages/widget-sdk/src/sandbox.ts`
- Test: `packages/contracts/test/sandbox-document.test.ts`, `packages/widget-sdk/test/sandbox-root.test.ts`, `apps/api/test/sandbox.test.ts` (CSP expectation)

**Interfaces:**
- Consumes: `fonts.css` (Task 2), the font route (Task 5).

- [ ] **Step 1: Write failing tests:**
  - `sandbox-document.test.ts`: the expected CSP string has `font-src http://h/sandbox/packages/abc/ http://h/sandbox/runtime/fonts/ data:`.
  - `sandbox-root.test.ts`: the first `<style>` in `head` contains `@font-face`, `font-family: 'Inter'` and a `url(` that ends with `/fonts/inter-latin.woff2)`, is absolute, and contains no `url(../fonts/`.
  - Update the CSP expectation in `apps/api/test/sandbox.test.ts`.
- [ ] **Step 2: Run** `pnpm -C packages/contracts test` and `pnpm -C packages/widget-sdk test -- sandbox-root`. Expected: FAIL.
- [ ] **Step 3: Implement.** `sandbox-document.ts`: `font-src ${packageDir} ${runtime}fonts/ data:`. `sandbox.ts`: import `../../../apps/ui/app/theme/styles/fonts.css?raw` and append `fontsCss.replaceAll('url(../fonts/', \`url(${new URL('fonts/', import.meta.url)}\`)` to the existing injected style text.
- [ ] **Step 4: Run** `pnpm -C packages/widget-sdk run docs`, `pnpm -C packages/widget-sdk run build`, `pnpm -C packages/widget-sdk test`, `pnpm -C packages/contracts test`, `pnpm -C apps/api test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(widget-sdk): load theme fonts in the sandbox`

---

### Task 7: Documentation

**Files:**
- Modify: `packages/widget-sdk/docs-src/design.md` («Typography and content»), `docs/theme-contract.md`, `README.md` (Appearance row)
- Generated: `packages/widget-sdk/docs/*.md` via `pnpm -C packages/widget-sdk run docs`
- Test: `packages/widget-sdk/test/docs.test.ts`

- [ ] **Step 1: Write the failing test:** `design.md` contains `--ld-font-heading` and the sentence fragment `never load fonts themselves`.
- [ ] **Step 2: Run** `pnpm -C packages/widget-sdk test -- docs`. Expected: FAIL.
- [ ] **Step 3: Write the docs** per the spec section «SDK and documentation»: `theme-contract.md` gets a «Fonts» section (optional keys, catalog location, `fetch:fonts`, generated `fonts.css`, inline application, licences). README Appearance row adds «heading and body fonts from 12 self-hosted families». Run `pnpm -C packages/widget-sdk run docs`.
- [ ] **Step 4: Run** `pnpm -C packages/widget-sdk test -- docs`. Expected: PASS.
- [ ] **Step 5: Commit** `docs: theme fonts`

---

### Task 8: Whole-branch verification

**Files:** none changed unless a check fails; a fix goes back to the owning task's files.

- [ ] **Step 1:** Run `pnpm typecheck`, `pnpm test`, `pnpm build` at the repository root. Expected: exit 0 each. Record test counts.
- [ ] **Step 2:** In the Orca browser (`orca-cli`) on a scratch database:
  - set Unbounded / Inter on a space and check headings and body text in a built-in widget and in `examples/widgets/showcase-clock` (sandbox), with Cyrillic and Latin text;
  - give one widget its own palette and Lora body: it shows Lora, its neighbours keep Inter;
  - change only the heading font while a sandbox widget is open: it updates without reload;
  - confirm in the network panel that only the used families' subsets load, and that the sandbox document request is `?doc=2` with `cache-control: no-cache`;
  - reset both fonts to `Theme default`: `system-ui` returns.
- [ ] **Step 3:** Run `pnpm -C apps/desktop run package` and `pnpm -C apps/api run smoke:bundle`. Expected: the app bundle contains `runtime/fonts/` with 24 `.woff2` and 12 `.OFL.txt`. If packaging is not possible on this machine, report it as unverified.
- [ ] **Step 4:** Report results, the measured font size, deviations and anything unverified.
