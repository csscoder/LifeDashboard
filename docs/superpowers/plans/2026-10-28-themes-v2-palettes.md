# Themes v2: palettes × styles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three fixed themes with a `{ palette, mode, style }` choice (11 palettes × light/dark/auto × solid/glass), generate and contrast-check every combination, and style semantic widget content with theme tokens in the host and the sandbox.

**Architecture:** `packages/contracts` gets a `ThemeChoice` type with legacy `themeId` mapping. The API migrates stored ids. `apps/ui/app/theme/generate.ts` builds token sets from palette seeds. A script writes a committed `generated.css` with 44 rules. The UI resolves the choice chain to a combination id `builtin:<slug>-<light|dark>-<solid|glass>` and keeps passing that string to frames and widget context as today. A shared `content.css` in `@layer ld.base` styles semantic elements; the SDK runtime injects it into the sandbox.

**Tech Stack:** TypeScript (strict), Vue 3 / Nuxt 4, reka-ui 2.11 (`Ui*` controls), Fastify + `node:sqlite`, Vitest 5, postcss (validator), pnpm workspace, Node 24 (runs `.ts` scripts directly).

**Spec:** `docs/superpowers/specs/2026-10-28-themes-v2-palettes-design.md`

## Global Constraints

- Choice: `ThemeChoice { palette: 'builtin:<slug>' (slug ^[a-z][a-z0-9-]{0,31}$), mode: 'light' | 'dark' | 'auto', style: 'solid' | 'glass' }`. It is inherited as a whole.
- Default choice: `{ palette: 'builtin:lifedashboard', mode: 'dark', style: 'glass' }`.
- Legacy mapping:

  | Legacy id | New value |
  | --- | --- |
  | `builtin:glass` | `{lifedashboard, dark, glass}` |
  | `builtin:obsidian` | `{lifedashboard, dark, solid}` |
  | `builtin:paper` | `{lifedashboard, light, solid}` |
  | `builtin:bare` | `'bare'` (widget only) |
  | other or null | `null` |

- Field precedence: `theme` wins when present, including `theme: null`. `themeId` is read only when `theme` is absent. An invalid `theme` is rejected even when `themeId` is valid.
- Combination key: `<slug>-<light|dark>-<solid|glass>`; resolved id `builtin:<key>`. Classes: `space--theme-<key>`, `widget--theme-<key>`, `space--skin-<style>`, `widget--skin-<style|bare>`.
- Combination order everywhere (generated CSS, `themes.json`): palettes in table order (lifedashboard first), modes `dark` then `light`, styles `glass` then `solid`. The first combination is the default.
- `CONTRACT_VERSION = 2`. `SKINS = ['solid', 'glass']`.
- New required tokens and their generated values:

  | Token | Generated value |
  | --- | --- |
  | `font-heading`, `font-body` | `system-ui, sans-serif` |
  | `size-h1`, `size-h2`, `size-h3`, `size-body`, `size-small` | `2em`, `1.5em`, `1.25em`, `1em`, `0.875em` (range 0.75–3em, strictly descending) |
  | `leading-heading` | `1.2` (range 1.0–1.6) |
  | `link` | equals `accent-text`; opaque; ≥ 4.5:1 on `surface-1/2/3` in translucent and solid modes |

- Files under `apps/ui/app/theme/` that Node imports directly — `color.ts`, `contract.ts`, `palettes.ts`, `generate.ts` — use explicit `.ts` relative import specifiers. Nuxt allows `allowImportingTsExtensions`.
- No new dependencies.
- Copy is English and matches the existing UI strings. Keep «Theme not found, showing the default theme» and «Could not save the theme».
- Between Task 1 and Task 8, `pnpm typecheck` and the full `apps/ui` suite may fail because fields are renamed. Each task runs the test files it names. Task 8 restores a green `pnpm -C apps/ui typecheck` and `pnpm -C apps/ui test`; Task 11 runs everything.
- Commit messages: `type(scope): subject`, with at most a two-line body and no attribution trailers.
- Deviation from the spec (confirm at plan review): the analog clock's wood/brass hand artwork keeps its material colours. It is illustration, not content text. The spec line «Built-in widgets» applies to text and UI, and `PlaceholderWidget` already uses token utilities.
- Clarification of the spec: the dev shell keeps its existing `?theme=<id>` parameter format, so the value is `builtin:<key>`, not a bare key.

## Review Focus

1. An unknown palette stored on a space (`builtin:nord`) must render the inherited theme, and saving unrelated space fields must not rewrite it. Test in Task 1 (parse keeps it) and Task 6 (resolution skips it).
2. An old open browser tab may PUT a board with legacy `themeId` on screens and widgets. The API must accept it and store `theme`. Test in Task 1 and Task 2.
3. A widget's own choice can equal the board's choice while both are `auto`. The widget must not become `foreign` after a system scheme change. Test in Task 6.
4. A migration may meet `widgets.appearance` with `{"themeId":"builtin:bare"}`, an unknown id, or a row without `themeId`. It must produce `theme: 'bare'`, `theme: null`, or leave the row valid, and never throw. Test in Task 2.
5. `auto` must follow a system scheme flip while a sandbox widget is open, and the widget must receive the new tokens. Test in Task 8 (`widget-context.test.ts`).

---

### Task 1: `ThemeChoice` contract and legacy parsing

**Files:**
- Create: `packages/contracts/src/theme.ts`
- Modify: `packages/contracts/src/board.ts` (`WidgetAppearance`, `ScreenBoard`, `normalizeAppearance`, `parseScreenBoard`, `parseAppearance`; remove `BARE_THEME_ID`, `isThemeId`, `BUILTIN_THEME`)
- Modify: `packages/contracts/src/space.ts` (`SpaceSummary`, `SpacePatch`, `PATCH_KEYS`, `parseSpacePatch`)
- Test: `packages/contracts/test/theme.test.ts` (new), `packages/contracts/test/board.test.ts`, `packages/contracts/test/space.test.ts`, `packages/contracts/test/background.test.ts` (fixture updates)

**Interfaces:**
- Produces (`@lifedashboard/contracts/theme`):
  - `type ThemeMode = 'light' | 'dark' | 'auto'`
  - `type ThemeStyle = 'solid' | 'glass'`
  - `interface ThemeChoice { palette: string; mode: ThemeMode; style: ThemeStyle }`
  - `const THEME_MODES: readonly ThemeMode[]`
  - `const THEME_STYLES: readonly ThemeStyle[]`
  - `isThemeChoice(value: unknown): value is ThemeChoice` — exact keys only.
  - `legacyTheme(themeId: unknown): ThemeChoice | 'bare' | null` — uses the Global Constraints mapping table.
  - `readTheme(raw: Record<string, unknown>, allowBare: boolean): ParseResult<ThemeChoice | 'bare' | null>` — applies the field precedence rule.
- Produces (`board.ts`):
  - `WidgetAppearance { theme: ThemeChoice | 'bare' | null; shadow; variant }`
  - `ScreenBoard.theme?: ThemeChoice | null` (omitted when null)
- Produces (`space.ts`):
  - `SpaceSummary.theme: ThemeChoice | null`
  - `SpacePatch.theme?: ThemeChoice | null`
  - `PATCH_KEYS` accepts `theme` and legacy `themeId`.

- [ ] **Step 1: Write failing tests** in `theme.test.ts`:

```ts
const gruvbox = { palette: 'builtin:gruvbox', mode: 'auto', style: 'glass' }
it('accepts an exact choice and rejects extra keys or bad values', () => {
  expect(isThemeChoice(gruvbox)).toBe(true)
  expect(isThemeChoice({ ...gruvbox, x: 1 })).toBe(false)
  expect(isThemeChoice({ ...gruvbox, mode: 'dim' })).toBe(false)
  expect(isThemeChoice({ ...gruvbox, palette: 'user:1' })).toBe(false)
  expect(isThemeChoice({ ...gruvbox, palette: 'builtin:Nord' })).toBe(false)
})
it.each([
  ['builtin:glass', { palette: 'builtin:lifedashboard', mode: 'dark', style: 'glass' }],
  ['builtin:obsidian', { palette: 'builtin:lifedashboard', mode: 'dark', style: 'solid' }],
  ['builtin:paper', { palette: 'builtin:lifedashboard', mode: 'light', style: 'solid' }],
  ['builtin:bare', 'bare'], ['builtin:nope', null], [null, null], [42, null],
])('maps legacy %s', (id, expected) => expect(legacyTheme(id)).toEqual(expected))
it('prefers theme over themeId, including null', () => {
  expect(readTheme({ theme: null, themeId: 'builtin:glass' }, false)).toEqual({ ok: true, value: null })
  expect(readTheme({ themeId: 'builtin:paper' }, false)).toEqual({ ok: true, value: { palette: 'builtin:lifedashboard', mode: 'light', style: 'solid' } })
  expect(readTheme({ theme: { palette: 'x' }, themeId: 'builtin:glass' }, false).ok).toBe(false)
  expect(readTheme({ theme: 'bare' }, false).ok).toBe(false)
  expect(readTheme({ theme: 'bare' }, true)).toEqual({ ok: true, value: 'bare' })
  expect(readTheme({ themeId: 'builtin:bare' }, false).ok).toBe(false)
})
```

In `board.test.ts`:
- A screen with `themeId: 'builtin:glass'` parses to `theme: {lifedashboard, dark, glass}` and has no `themeId` key.
- An instance with `appearance: { themeId: 'builtin:bare', shadow: null }` parses to `appearance.theme === 'bare'`.
- An instance with `appearance: { themeId: null, shadow: null }` parses to no `appearance`.
- A screen with `theme: { palette: 'builtin:nord', mode: 'dark', style: 'solid' }` keeps it unchanged (Review Focus 1).

In `space.test.ts`:
- `parseSpacePatch({ theme: gruvbox })` gives `{ theme: gruvbox }`.
- `parseSpacePatch({ themeId: 'builtin:paper' })` gives the mapped choice.
- `parseSpacePatch({ theme: 'bare' })` fails with `invalid space theme`.
- Replace existing `themeId` expectations.

- [ ] **Step 2: Run** `pnpm -C packages/contracts test`. Expected: the new tests FAIL (`legacyTheme` is not exported, and `theme` is missing).

- [ ] **Step 3: Implement.**
  - Create `theme.ts` with the Interfaces above. `readTheme` returns `fail('invalid theme')`; callers replace the message with `invalid screen theme`, `invalid space theme` or `invalid widget appearance`.
  - In `board.ts`, replace the `themeId` handling with `readTheme`.
  - `normalizeAppearance` treats `theme === null && shadow === null && variant === null` as empty and emits keys in the order `theme, shadow, variant`.
  - `parseScreenBoard` omits `theme` when null.
  - In `space.ts`, `parseSpacePatch` sets `patch.theme` when either key is present, using `readTheme(raw, false)`.

- [ ] **Step 4: Run** `pnpm -C packages/contracts test` and `pnpm -C packages/contracts typecheck`. Expected: PASS.

- [ ] **Step 5: Commit** `feat(contracts): add ThemeChoice with legacy themeId mapping`

---

### Task 2: API storage and migration

**Files:**
- Modify: `apps/api/src/migrations.ts` (append one function migration)
- Modify: `apps/api/src/spaces.ts` (read and write `spaces.theme`, `screens.theme`; `SPACE_COLUMNS`, `updateSpace`, board load and save)
- Test: `apps/api/test/db.test.ts`, `apps/api/test/spaces.test.ts`

**Interfaces:**
- Consumes: `legacyTheme`, `ThemeChoice` (Task 1).
- Produces: the API returns `SpaceSummary.theme` and `ScreenBoard.theme`. The `theme_id` columns stay but are never read or written.

- [ ] **Step 1: Write failing tests.**

  In `db.test.ts`, seed rows at the previous `user_version`, run migrations, then assert:
  - space `theme_id = 'builtin:paper'` → `JSON.parse(theme)` equals `{ palette: 'builtin:lifedashboard', mode: 'light', style: 'solid' }`;
  - screen `theme_id = 'builtin:glass'` → the glass choice;
  - `theme_id` NULL or `'builtin:nope'` → `theme` IS NULL;
  - widget appearance `{"themeId":"builtin:bare","shadow":null}` → `{"theme":"bare","shadow":null}`;
  - `{"themeId":"builtin:glass","shadow":{…}}` → `theme` equals the glass choice and the shadow is kept;
  - `{"themeId":null,"shadow":null,"variant":"roman"}` → `theme: null`, `variant` kept;
  - a row with appearance `'not json'` is left unchanged and the migration does not throw.

  In `spaces.test.ts`:
  - update `themeId: null` expectations to `theme: null`;
  - PATCH `{ theme: gruvbox }` round-trips through GET;
  - PATCH `{ themeId: 'builtin:paper' }` stores the mapped choice;
  - PUT a board whose screen has `themeId: 'builtin:obsidian'` and whose instance has `appearance.themeId: 'builtin:bare'` → GET returns `theme` values and no `themeId` (Review Focus 2);
  - PUT with `theme: { palette: 'x' }` → 400.

- [ ] **Step 2: Run** `pnpm -C apps/api test -- db spaces`. Expected: FAIL.

- [ ] **Step 3: Implement the migration** as a function migration `(db) => void`, following the existing pattern at the top of `migrations.ts`:
  - `ALTER TABLE spaces ADD COLUMN theme TEXT`, `ALTER TABLE screens ADD COLUMN theme TEXT`.
  - For each row with non-null `theme_id`, set `theme = JSON.stringify(legacyTheme(theme_id))` unless the mapping is `null` or `'bare'`.
  - For each `widgets` row with non-null `appearance`, `JSON.parse` it inside `try`. If the object has `themeId`, set `theme = legacyTheme(themeId)`, delete `themeId` and write it back. Skip rows that fail to parse.

  Update `spaces.ts` to select `theme`, write `theme` (`JSON.stringify` or NULL) in `updateSpace` and the board save, and `JSON.parse` on read.

- [ ] **Step 4: Run** `pnpm -C apps/api test` and `pnpm -C apps/api typecheck`. Expected: PASS.

- [ ] **Step 5: Commit** `feat(api): store theme choices and migrate legacy theme ids`

---

### Task 3: Colour conversion and contract v2 tokens

**Files:**
- Modify: `apps/ui/app/theme/color.ts` (add `hexToOklch`, `formatOklch`)
- Modify: `apps/ui/app/theme/contract.ts`:
  - `CONTRACT_VERSION = 2`;
  - `SKINS = ['solid', 'glass']`;
  - rename `ThemeMode` → `ColorScheme = 'light' | 'dark'`;
  - `ThemeMeta.skin: SkinId`;
  - add the new tokens to `REQUIRED_TOKENS`; add `link` to `OPAQUE_TOKENS`.
- Modify: `apps/ui/app/theme/validate-theme.ts`: size order check, `link` contrast row, `ColorScheme` rename.
- Test: `apps/ui/test/color.test.ts`, `apps/ui/test/theme-contract.test.ts`

**Interfaces:**
- Produces:
  - `hexToOklch(hex: string): Oklch` — `#rrggbb`, alpha 1; throws on other input.
  - `formatOklch(c: Oklch): string` — `oklch(L C H)`, or `oklch(L C H / A)` when alpha < 1. Round L, C and A to 4 decimals and H to 2.
  - `type ColorScheme = 'light' | 'dark'`.

- [ ] **Step 1: Write failing tests.**
  - `color.test.ts`:
    - `hexToOklch('#ffffff')` has `l` ≈ 1 (±0.001) and `c` < 0.001;
    - for `#1e1e2e`, `#fbf1c7` and `#d3869b`, `toRgba(hexToOklch(hex))` channels × 255 are within 1 of the hex bytes;
    - `formatOklch({ l: 0.5, c: 0.1, h: 280, alpha: 0.5 })` is `'oklch(0.5 0.1 280 / 0.5)'`.
  - `theme-contract.test.ts`:
    - `size-h2: 2.5em` (greater than `size-h1: 2em`) fails with rule `value` and `/size-h1 > size-h2 > size-h3 > size-body > size-small/`;
    - a `link` equal to `surface-2` fails with rule `contrast` and `/link on surface-2/`;
    - a missing `font-heading` fails with `missing`.

    Base fixture: build the obsidian test base via `withToken` plus appended new tokens until Task 4 replaces fixtures with generated rules. Add a helper `withNewTokens(css)` that inserts the five size tokens, `font-heading`, `font-body`, `leading-heading` and `link: var(--ld-accent-text)`.

- [ ] **Step 2: Run** `pnpm -C apps/ui test -- color theme-contract`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - `hexToOklch`: sRGB decode → linear → OKLab (Björn Ottosson matrices) → LCh, hue in degrees 0–360, and `h = 0` when `c < 1e-4`.
  - Validator:
    - check strictly descending sizes in the existing weight-order style;
    - add `link` to the contrast rows next to `accent-text` (on `surface-1`, `surface-2`, `surface-3`, both modes, 4.5).

- [ ] **Step 4: Run** `pnpm -C apps/ui test -- color theme-contract`. Expected: the new tests PASS. The «built-in themes» block fails because the legacy CSS lacks the new tokens; Task 4 replaces that block. Record this in the task report.

- [ ] **Step 5: Commit** `feat(ui): theme contract v2 tokens and oklch conversion`

---

### Task 4: Palettes, generator and generated CSS

**Files:**
- Create: `apps/ui/app/theme/palettes.ts`, `apps/ui/app/theme/generate.ts`, `apps/ui/scripts/gen-themes.ts`, `apps/ui/app/theme/styles/themes/generated.css` (script output)
- Modify: `apps/ui/package.json` (add the script `"gen:themes": "node scripts/gen-themes.ts"`), `apps/ui/app/theme/styles/layers.css` (import `generated.css` into `ld.theme` after the legacy imports; Task 8 removes the legacy ones)
- Test: `apps/ui/test/theme-generate.test.ts` (new), `apps/ui/test/theme-contract.test.ts` (the «built-in themes» block iterates generated rules)

**Interfaces:**
- Consumes: `hexToOklch`, `formatOklch`, `parseColor`, `toRgba`, `composite`, `contrastRatio` (Task 3), `ThemeStyle` (Task 1).
- Produces:
  - `palettes.ts`:
    - `interface Seed { bg: string; surface: [string, string, string]; text: [string, string, string, string]; border: string; accent: string; success: string; warning: string; danger: string; info: string }` — each value is `#rrggbb` or an `oklch()` literal;
    - `interface Palette { slug: string; name: string; source: string; light: Seed; dark: Seed }`;
    - `BUILTIN_PALETTES: readonly Palette[]` (table order);
    - `BUILTIN_PALETTE_IDS: ReadonlySet<string>` (`builtin:<slug>`).
  - `generate.ts`:
    - `buildTokens(palette: Palette, scheme: ColorScheme, style: ThemeStyle): Record<string, string>` — keys are `--ld-*`;
    - `interface ThemeCombo { key: string; id: string; name: string; mode: ColorScheme; style: ThemeStyle; tokens: Record<string, string> }` — `name` is `'<Palette> <Dark|Light> <Glass|Solid>'`;
    - `allThemeCombos(): ThemeCombo[]` — Global Constraints order;
    - `themeRule(combo: ThemeCombo): string`;
    - `generateThemesCss(): string` — the header comment `/* Generated by pnpm -C apps/ui gen:themes. Do not edit. */` plus all rules.

Seed role mapping. Copy hex values from the upstream files in each `source`. When an upstream name is missing, use the role-equivalent colour and add `// mapped: <upstream name>`. When a step is missing, shift the nearest step by L ±0.03 and add `// derived`. Hand-tuned values get `// tuned for contrast`.

| Slug | Source | Dark / Light | bg | surface ×3 | text ×4 | border | accent | success / warning / danger / info |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `lifedashboard` | repo `styles/themes/glass.css`, `paper.css` (oklch literals) | glass / paper | `bg` | `surface-1-solid`, `surface-2`, `surface-3` | `text-primary…disabled` | glass: `oklch(0.55 0.03 280)`; paper: its `border-strong` | `accent` | statuses `<s>` |
| `catppuccin` | catppuccin/palette `palette.json` | mocha / latte | mantle | base, surface0, surface1 | text, subtext1, subtext0, overlay0 | surface2 | mauve | green / yellow / red / blue |
| `gruvbox` | morhetz/gruvbox README palette (dark: bright_*, light: faded_*) | dark / light | dark bg0_h, light bg1 | dark bg0, bg1, bg2; light bg0_h, bg0, bg2 | fg1, fg2, fg3, fg4 | bg3 | orange | green / yellow / red / blue |
| `github` | primer/github-vscode-theme (Primer primitives) | dark default / light default | canvas.inset | canvas.default, canvas.subtle, canvas.overlay | fg.default, fg.muted, fg.subtle, fg.subtle | border.default | accent.fg | success.fg / attention.fg / danger.fg / done.fg |
| `solarized` | altercation/solarized | dark / light | dark base03, light base2 | dark base02 + 2 derived; light base3 + 2 derived | dark base1, base0, base01, base00; light base01, base00, base1, base1 | dark base01, light base1 | blue | green / yellow / red / cyan |
| `tokyo-night` | tokyo-night/tokyo-night-vscode-theme README | night / day | panel/terminal background | editor background, highlight, selection | foreground, secondary fg, comment, dark comment | border | blue | green / yellow / red / cyan |
| `rose-pine` | rose-pine/rose-pine-theme | main / dawn | base | surface, overlay, highlightMed | text, subtle, muted, muted | highlightHigh | iris | pine / gold / love / foam |
| `everforest` | sainnhe/everforest palette (medium) | dark / light | bg_dim | bg0, bg1, bg2 | fg, grey2, grey1, grey0 | bg4 | green | aqua / yellow / red / blue |
| `one` | atom/one-dark-syntax, one-light-syntax `colors.less` | dark / light | syntax-bg L −0.03 derived | syntax-bg, +0.04, +0.08 derived | mono-1, mono-2, mono-3, mono-3 | syntax-gutter / guide | hue-2 | hue-4 / hue-6-2 / hue-5 / hue-1 |
| `kanagawa` | rebelot/kanagawa.nvim `lua/kanagawa/colors.lua` | wave / lotus | sumiInk2 / lotusWhite2 | sumiInk3–5 / lotusWhite3–5 | fujiWhite, oldWhite, fujiGray, katanaGray / lotusInk1, lotusInk2, lotusGray3, lotusGray2 | sumiInk6 / lotusWhite5 | oniViolet / lotusViolet4 | springGreen, carpYellow, waveRed, crystalBlue / lotusGreen, lotusYellow, lotusRed, lotusBlue4 |
| `ayu` | ayu-theme/ayu-colors | dark / light | ui.bg | editor.bg, ui.panel.bg, ui.line | editor.fg, ui.fg, syntax.comment, syntax.comment | ui.line | common.accent | syntax.string / syntax.func / syntax.error / syntax.tag |

- [ ] **Step 1: Write failing tests** in `theme-generate.test.ts`:

```ts
const combos = allThemeCombos()
it('has 44 combinations in the fixed order', () => {
  expect(combos).toHaveLength(44)
  expect(combos[0]!.id).toBe('builtin:lifedashboard-dark-glass')
  expect(combos[3]!.id).toBe('builtin:lifedashboard-light-solid')
})
it.each(combos.map((c) => [c.key, c] as const))('%s passes the contract', (_, combo) => {
  expect(validateThemeCss(themeRule(combo), { slug: combo.key, mode: combo.mode })).toEqual({ ok: true })
})
it('keeps generated.css in sync', () => {
  expect(readFileSync(new URL('../app/theme/styles/themes/generated.css', import.meta.url), 'utf8')).toBe(generateThemesCss())
})
it('applies the style rules', () => {
  const ld = BUILTIN_PALETTES[0]!
  expect(buildTokens(ld, 'dark', 'glass')['--ld-surface-1']).toBe('oklch(1 0 0 / 0.08)')
  expect(buildTokens(ld, 'light', 'glass')['--ld-surface-1']).toBe('oklch(1 0 0 / 0.55)')
  expect(buildTokens(ld, 'dark', 'solid')['--ld-blur']).toBeUndefined()
  expect(buildTokens(ld, 'dark', 'glass')['--ld-radius-widget']).toBe('1rem')
  expect(buildTokens(ld, 'dark', 'solid')['--ld-radius-widget']).toBe('0.75rem')
  expect(buildTokens(ld, 'dark', 'solid')['--ld-link']).toBe(buildTokens(ld, 'dark', 'solid')['--ld-accent-text'])
})
it('throws with palette, mode, style and token when no text colour passes', () => {
  const bad = { ...BUILTIN_PALETTES[0]!, slug: 'bad', dark: { ...BUILTIN_PALETTES[0]!.dark, surface: ['#808080', '#808080', '#808080'] as [string, string, string], bg: '#808080', text: ['#808080', '#808080', '#808080', '#808080'] as [string, string, string, string] } }
  expect(() => buildTokens(bad, 'dark', 'solid')).toThrow(/bad dark solid: .*-text/)
})
```

Replace the «built-in themes» block in `theme-contract.test.ts` with the per-combination test above, and use `themeRule(allThemeCombos()[1]!)` (key `lifedashboard-dark-solid`) as the base fixture for the negative cases. Update the selector expectations to that key.

- [ ] **Step 2: Run** `pnpm -C apps/ui test -- theme-generate theme-contract`. Expected: FAIL (the modules do not exist).

- [ ] **Step 3: Implement `palettes.ts`** using the role table, then **`generate.ts`** using the spec section «Generator». The one algorithm the signature leaves open is the `*-text` search:

```ts
// For accent and each status: start at the seed, step L by 0.01 towards text-primary's L,
// stop when contrast ≥ 4.6 (margin over 4.5 for 4-decimal rounding) against every background:
// surface-1-solid, surface-1 composited over bg and over each backdrop stop, surface-2, surface-3,
// and the colour's own *-subtle composited over each of those. Throw
// `${slug} ${scheme} ${style}: no ${name}-text passes 4.5:1` after 50 steps.
```

Then write `scripts/gen-themes.ts`, which writes `generateThemesCss()` to the CSS path, and run `pnpm -C apps/ui gen:themes`. Add the `generated.css` import to `layers.css`.

- [ ] **Step 4: Run** `pnpm -C apps/ui test -- theme-generate theme-contract`. Expected: PASS. If a combination fails contrast, tune that palette's seed and mark it `// tuned for contrast`. If a style-level value is the cause, change the style constant for all palettes. Never special-case a palette in `generate.ts`.

- [ ] **Step 5: Commit** `feat(ui): generate palette × style themes with contrast checks`

---

### Task 5: Content base styles

**Files:**
- Create: `apps/ui/app/theme/styles/content.css`
- Modify:
  - `apps/ui/app/theme/styles/layers.css` — layer order `ld.reset, ld.base, ld.frame, ld.skin, ld.theme, ld.utilities, ld.widget, ld.comfort`; `@import './content.css';`;
  - `apps/ui/app/theme/styles/frame.css` — `font-family: var(--ld-font-body)`;
  - `apps/ui/app/widgets/WidgetFrame.vue` — add class `ld-content` to the `.widget__body` element.
- Test: `apps/ui/test/theme-content.test.ts` (new)

**Interfaces:**
- Produces: `content.css`, a single `@layer ld.base { … }` block whose selectors start with `:where(.ld-content)`. Task 9 embeds the same file in the sandbox.

- [ ] **Step 1: Write failing tests** in `theme-content.test.ts`:
  - Parse `content.css` with postcss. Every rule's parent is `@layer ld.base`, and every selector starts with `:where(.ld-content)`.
  - A rule for exactly `:where(.ld-content)` declares `color: var(--ld-text-primary)`, `font-family: var(--ld-font-body)`, `font-size: var(--ld-size-body)`, `line-height: var(--ld-leading)` and `letter-spacing: var(--ld-tracking)`.
  - `a:focus-visible` declares `outline: 0.125rem solid var(--ld-focus-ring)` and `outline-offset: 0.125rem`.
  - `pre code` declares `font-size: inherit`.
  - `layers.css` declares the new layer order.
  - Mounting `WidgetFrame` renders `.widget__body.ld-content`.

- [ ] **Step 2: Run** `pnpm -C apps/ui test -- theme-content`. Expected: FAIL.

- [ ] **Step 3: Write `content.css`** with the exact declarations from the spec section «Base styles». Use `:where(.ld-content) :where(h1)` style selectors, `:where(.ld-content) :where(:last-child)` for `margin-bottom: 0`, and `:where(.ld-content) :where(a):hover` for the underline.

- [ ] **Step 4: Run** `pnpm -C apps/ui test -- theme-content widget-host`. Expected: PASS.

- [ ] **Step 5: Commit** `feat(ui): style semantic widget content with theme tokens`

---

### Task 6: Theme resolution core

**Files:**
- Modify:
  - `apps/ui/app/theme/builtin.ts` — replace `BUILTIN_THEMES`, `BUILTIN_THEME_IDS` and `DEFAULT_THEME_ID`;
  - `apps/ui/app/theme/resolve.ts`;
  - `apps/ui/app/theme/appearance.ts`.
- Create: `apps/ui/app/theme/color-scheme.ts`
- Test: `apps/ui/test/theme-resolve.test.ts`

**Interfaces:**
- Consumes: `ThemeChoice`, `legacyTheme`, `isThemeChoice` (Task 1); `BUILTIN_PALETTES`, `BUILTIN_PALETTE_IDS` (Task 4).
- Produces:
  - `builtin.ts`:
    - `DEFAULT_THEME: ThemeChoice`;
    - `themeKey(choice: ThemeChoice, scheme: ColorScheme): string` — resolves `auto` with `scheme`;
    - `themeMeta(id: string): { id: string; mode: ColorScheme; skin: ThemeStyle }` — parses `builtin:<slug>-<mode>-<style>`; any other id gives the default combination's meta.
  - `resolve.ts`:
    - `resolveTheme(chain: readonly (ThemeChoice | null | undefined)[], scheme: ColorScheme): string` — returns `builtin:<key>` of the first choice whose palette is in `BUILTIN_PALETTE_IDS`, else `DEFAULT_THEME`;
    - `resolveWidgetLook(appearance: WidgetAppearance | undefined, boardThemeId: string, scheme: ColorScheme): { themeId: string; skin: FrameSkin; foreign: boolean }`;
    - `type FrameSkin = ThemeStyle | 'bare'`;
    - `themeClass` is unchanged.
  - `color-scheme.ts`: `useColorScheme(): Readonly<Ref<ColorScheme>>`. One module-level ref is shared by all callers. It is `'dark'` when `matchMedia` is missing and updates on the `change` event.
  - `appearance.ts`: `Appearance { schemaVersion: 2; theme: ThemeChoice | null }`. `loadAppearance()` reads version 2, maps version 1 `themeId` through `legacyTheme`, and turns `'bare'` into `null`. `saveAppearance(a: Appearance): boolean`.

- [ ] **Step 1: Write failing tests** (rewrite `theme-resolve.test.ts`):

```ts
const g = (mode: ThemeMode, style: ThemeStyle = 'glass') => ({ palette: 'builtin:gruvbox', mode, style })
it('takes the first known choice and resolves auto', () => {
  expect(resolveTheme([null, { palette: 'builtin:nord', mode: 'dark', style: 'solid' }, g('auto')], 'light')).toBe('builtin:gruvbox-light-glass')
  expect(resolveTheme([undefined, null], 'dark')).toBe('builtin:lifedashboard-dark-glass')
})
it('keeps an auto widget equal to an auto board non-foreign in both schemes', () => {
  for (const scheme of ['light', 'dark'] as const) {
    const board = resolveTheme([g('auto')], scheme)
    expect(resolveWidgetLook({ theme: g('auto'), shadow: null, variant: null }, board, scheme).foreign).toBe(false)
  }
})
it('marks a different choice foreign and keeps the board key for bare', () => {
  const board = 'builtin:gruvbox-dark-glass'
  expect(resolveWidgetLook({ theme: g('dark', 'solid'), shadow: null, variant: null }, board, 'dark')).toEqual({ themeId: 'builtin:gruvbox-dark-solid', skin: 'solid', foreign: true })
  expect(resolveWidgetLook({ theme: 'bare', shadow: null, variant: null }, board, 'dark')).toEqual({ themeId: board, skin: 'bare', foreign: false })
})
it('reads combination meta', () => {
  expect(themeMeta('builtin:rose-pine-light-solid')).toEqual({ id: 'builtin:rose-pine-light-solid', mode: 'light', skin: 'solid' })
})
it('maps a version 1 appearance', () => {
  localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, themeId: 'builtin:paper' }))
  expect(loadAppearance()).toEqual({ schemaVersion: 2, theme: { palette: 'builtin:lifedashboard', mode: 'light', style: 'solid' } })
  localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, themeId: 'builtin:bare' }))
  expect(loadAppearance().theme).toBeNull()
})
it('follows matchMedia changes', () => { /* stub matchMedia with a listener list; flip matches; expect the ref to change */ })
```

Keep the existing storage edge cases (throwing `getItem`/`setItem`, unknown fields) adapted to version 2.

- [ ] **Step 2: Run** `pnpm -C apps/ui test -- theme-resolve`. Expected: FAIL.
- [ ] **Step 3: Implement** the Interfaces. `themeMeta` splits the key from the right: the last segment is the style and the one before it is the mode.
- [ ] **Step 4: Run** `pnpm -C apps/ui test -- theme-resolve`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(ui): resolve theme choices with auto colour scheme`

---

### Task 7: `ThemePicker` component

**Files:**
- Create: `apps/ui/app/theme/ThemePicker.vue`
- Test: `apps/ui/test/theme-picker.test.ts` (new)

**Interfaces:**
- Consumes: `BUILTIN_PALETTES` (Task 4), `themeKey`, `useColorScheme` (Task 6), `UiRadioGroup` (`apps/ui/app/ui/UiRadioGroup.vue`; read its props before use).
- Produces: `<ThemePicker v-model="value" :inherit="boolean" :bare="boolean" :inherited="ThemeChoice" :unavailable="boolean" :disabled="boolean" />`, where `value` is `ThemeChoice | 'bare' | null`.
  - `unavailable` shows «Theme unavailable — inherited» under Inherit for a stored unknown palette, which the picker treats as Inherit.

- [ ] **Step 1: Write failing tests** with `@vue/test-utils`, following `ui-controls-reka.test.ts`:
  - Renders 11 palette radios with accessible names equal to the palette names.
  - Each tile has the class `widget--theme-<slug>-<resolved mode>-solid`.
  - Starting from `null` with `inherit` and `inherited = {gruvbox, light, solid}`, clicking the «Catppuccin» tile emits `{ palette: 'builtin:catppuccin', mode: 'light', style: 'solid' }`.
  - With `modelValue` `{catppuccin, dark, glass}`, choosing Style «Solid» emits the same palette and mode with `style: 'solid'`, and choosing Mode «Auto» emits `mode: 'auto'`.
  - The Inherit option emits `null` and is absent without `inherit`.
  - The «No frame» option emits `'bare'` and is absent without `bare`.
  - With `null` or `'bare'`, the Mode and Style groups are disabled.
  - Pressing ArrowRight on the focused tile moves the selection to the next palette.

- [ ] **Step 2: Run** `pnpm -C apps/ui test -- theme-picker`. Expected: FAIL.

- [ ] **Step 3: Implement** with a reka-ui `RadioGroupRoot` for the tiles in a 4-column grid, and `UiRadioGroup` for Mode (`Light`, `Dark`, `Auto`) and Style (`Solid`, `Glass`).
  - Legends: `Palette`, `Mode`, `Style`.
  - Options: `Inherit` and `No frame`.
  - Tile content: a background of `var(--ld-bg)`, a text line in `var(--ld-text-primary)`, an accent dot in `var(--ld-accent)`, and the name.

- [ ] **Step 4: Run** `pnpm -C apps/ui test -- theme-picker`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(ui): add the palette, mode and style picker`

---

### Task 8: Wire choices through the UI and remove legacy themes

**Files:**
- Modify:
  - `apps/ui/app/app.vue`;
  - `apps/ui/app/SettingsPanel.vue` — prop `theme: ThemeChoice`, emit `theme: [choice: ThemeChoice]`;
  - `apps/ui/app/spaces/SpacePicker.vue` — emits `pick` with `{ theme }`;
  - `apps/ui/app/spaces/SpaceSwitcher.vue` — prop `dashboardTheme: ThemeChoice | null`;
  - `apps/ui/app/spaces/ScreenDots.vue` — prop `theme: ThemeChoice | null`, emit `theme: [ThemeChoice | null]`;
  - `apps/ui/app/board/WidgetBoard.vue` — `screenTheme`, `setScreenTheme(theme: ThemeChoice | null)`, `resolveWidgetLook(..., scheme)`;
  - `apps/ui/app/board/edit-session.ts` — `withTheme(doc: ScreenBoard, theme: ThemeChoice | null)`;
  - `apps/ui/app/board/widget-settings.ts` — remove `styleValue`; `withStyle(appearance, theme: ThemeChoice | 'bare' | null)`; `withShadow` and `withVariant` keep `theme`;
  - `apps/ui/app/board/WidgetSettings.vue` — the Style row uses `ThemePicker` with `inherit` and `bare`;
  - `apps/ui/app/widgets/WidgetFrame.vue` and `apps/ui/app/widgets/context.ts` — keep `themeMeta(id)`, which is now combination-aware;
  - `apps/ui/app/theme/styles/layers.css` — drop the legacy theme and paper skin imports.
- Delete: `apps/ui/app/theme/styles/themes/glass.css`, `obsidian.css`, `paper.css`, `apps/ui/app/theme/styles/skins/paper.css`
- Test:
  - `apps/ui/test/settings-panel.test.ts`, `screen-dots.test.ts`, `space-sync.test.ts`, `edit-session.test.ts`;
  - `widget-settings.test.ts`, `widget-settings-panel.test.ts`, `widget-host.test.ts`, `widget-context.test.ts`, `ui-select.test.ts`;
  - any other file `grep -rlE "themeId|BUILTIN_THEMES|BARE_THEME_ID|builtin:(glass|paper|obsidian)" apps/ui` lists.

**Interfaces:**
- Consumes: Tasks 1, 6 and 7.
- Produces: the root element classes `space space--theme-<key> space--skin-<style>`. The `context.theme.id` of each widget is `builtin:<key>`.

- [ ] **Step 1: Update or write failing tests:**
  - `widget-context.test.ts`: with a stubbed `matchMedia` and a widget whose resolved id changes from `builtin:gruvbox-dark-glass` to `builtin:gruvbox-light-glass`, `context.theme` becomes `{ id: 'builtin:gruvbox-light-glass', scheme: 'light', tokens: … }` after `nextTick` (Review Focus 5).
  - `space-sync.test.ts`: a space with `theme: {palette: 'builtin:nord', …}` resolves to the dashboard theme. Saving its icon sends a patch without `theme` (Review Focus 1).
  - `settings-panel.test.ts`: choosing a tile emits `theme` with the choice.
  - `screen-dots.test.ts`: the picker shows Inherit, and the emitted choice goes into the draft.
  - `widget-settings.test.ts`: `withStyle(undefined, 'bare')` equals `{ theme: 'bare', shadow: null, variant: null }`.
  - Replace legacy ids in every remaining fixture.

- [ ] **Step 2: Run** `pnpm -C apps/ui test`. Expected: FAIL in the updated files.

- [ ] **Step 3: Implement.** In `app.vue`:
  - `dashboardTheme = ref(loadAppearance().theme)`;
  - `scheme = useColorScheme()`;
  - `themeId = computed(() => resolveTheme([screenTheme, spaceTheme, dashboardTheme.value], scheme.value))`;
  - `themeNotice` when the stored palette is not in `BUILTIN_PALETTE_IDS`;
  - `selectTheme(choice)` saves `{ schemaVersion: 2, theme: choice }`.

  The dashboard picker passes `inherited = DEFAULT_THEME` and no `inherit`. Space and screen pickers pass `inherit` and `inherited` = the choice resolved one scope up. The widget picker passes `inherit`, `bare` and `inherited` = the board choice. Delete the legacy CSS files and their imports.

- [ ] **Step 4: Run** `pnpm -C apps/ui test` and `pnpm -C apps/ui typecheck`. Expected: PASS for both.
- [ ] **Step 5: Commit** `feat(ui): pick palette, mode and style at every theme scope`

---

### Task 9: SDK runtime, dev shell and shots

**Files:**
- Modify:
  - `packages/widget-sdk/src/sandbox.ts` — inject base CSS, `ld-content` on `body`;
  - `packages/widget-sdk/src/env.d.ts` — `declare module '*.css?raw'`, if not already typed;
  - `packages/widget-sdk/scripts/build.ts` — themes from `allThemeCombos()`; skins `['bare', 'glass', 'solid']`; append `content.css` to `frameRules`;
  - `packages/widget-sdk/src/shot.ts` — default themes and `all`;
  - `packages/widget-sdk/src/cli.ts` — help text for `--theme all`;
  - `packages/widget-sdk/scripts/docs.ts` — `THEME_IDS` from `allThemeCombos()` filtered to the four reference ids, plus one line on the key format.
- Test: `packages/widget-sdk/test/sandbox-root.test.ts`, `shot.test.ts`, `dev-assets.test.ts`, `shell-state.test.ts`, `dev-parity.test.ts`, and the other files from `grep -rlE "builtin:(glass|paper|obsidian)" packages/widget-sdk/test`

**Interfaces:**
- Consumes: `allThemeCombos` (Task 4), `content.css` (Task 5).
- Produces:
  - `SHOT_DEFAULT_THEMES: readonly string[]` = `['builtin:lifedashboard-dark-glass', 'builtin:lifedashboard-dark-solid', 'builtin:lifedashboard-light-glass', 'builtin:lifedashboard-light-solid']`, exported from `shot.ts`;
  - `shotCombos(sizing, themeIds, { themes: ['all'] })` expands to all `themeIds`.

- [ ] **Step 1: Write failing tests:**
  - `sandbox-root.test.ts`: after boot, `document.head.firstElementChild` is a `<style>` whose text starts with `@layer ld.base;` and contains `:where(.ld-content)`, and `document.body.classList` contains `ld-content`.
  - `shot.test.ts`: without `themes`, the combos use exactly `SHOT_DEFAULT_THEMES`; `themes: ['all']` yields `themeIds.length` themes; an unknown theme still throws with the existing message.
  - `dev-assets.test.ts`: `themes.json` has 44 entries, the first id is `builtin:lifedashboard-dark-glass`, and `frame.css` contains `.ld-content`.
  - `shell-state.test.ts`: a missing or unknown `theme` parameter gives `builtin:lifedashboard-dark-glass`.

- [ ] **Step 2: Run** `pnpm -C packages/widget-sdk test`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - `sandbox.ts`: import `../../../apps/ui/app/theme/styles/content.css?raw`; in `followContext`, prepend `<style>` = `'@layer ld.base;\n' + css` to `document.head` and add the body class.
  - `shot.ts`: the default is `SHOT_DEFAULT_THEMES` filtered to the known `themeIds`; `'all'` expands to all.

- [ ] **Step 4: Run** `pnpm -C packages/widget-sdk run build`, then `pnpm -C packages/widget-sdk test` and `pnpm -C packages/widget-sdk typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(widget-sdk): palette themes in the dev shell and base content styles in the sandbox`

---

### Task 10: SDK, agent and theme documentation

**Files:**
- Modify:
  - `packages/widget-sdk/docs-src/design.md` — «Theme tokens» (choice model, new Type tokens); new «Typography and content»; «em, rem and rootFontSize»;
  - `packages/widget-sdk/docs-src/workflow.md` — the example `?theme=builtin:lifedashboard-light-solid`;
  - `packages/create-widget/template/AGENTS.md` — three short rules;
  - `docs/theme-contract.md` — rewrite for v2;
  - `README.md` — Appearance rows and themes list.
- Generated: `packages/widget-sdk/docs/*.md` via `pnpm -C packages/widget-sdk run docs`
- Test: `packages/widget-sdk/test/docs.test.ts`, `packages/create-widget/test/create.test.ts`

- [ ] **Step 1: Write failing tests:**
  - `docs.test.ts`: `design.md` contains the heading `## Typography and content`, every new token name (`font-heading`, `font-body`, `size-h1`, `size-h2`, `size-h3`, `size-body`, `size-small`, `leading-heading`, `link`), the phrase `in \`em\``, and no remaining `builtin:glass`, `builtin:paper` or `builtin:obsidian` in any docs file.
  - `create.test.ts`: the template `AGENTS.md` mentions `size-*` and `--ld-link`.

- [ ] **Step 2: Run** `pnpm -C packages/widget-sdk test -- docs` and `pnpm -C packages/create-widget test`. Expected: FAIL.

- [ ] **Step 3: Write the docs** per the spec section «SDK and agent knowledge».
  - Telegram example: a `<ul>` of three `<li>` cards with `background: var(--ld-surface-2)`, `border-radius: var(--ld-radius-card)`, `padding: 0.75em`; author in `<small>`; title in `<h3>`; link `<a>`; no literal colour.
  - `theme-contract.md` describes:
    - the choice model;
    - the generator and the `gen:themes` script;
    - the generated file;
    - the new tokens and contrast rows;
    - that importing user palettes is planned.

  Run `pnpm -C packages/widget-sdk run docs`.

- [ ] **Step 4: Run** the Step 2 commands. Expected: PASS.
- [ ] **Step 5: Commit** `docs: theme palettes, content typography and em sizing`

---

### Task 11: Whole-branch verification

**Files:** none changed unless a check fails. A fix goes back to the owning task's files.

- [ ] **Step 1:** Run `pnpm typecheck`, `pnpm test` and `pnpm build` at the repo root. Expected: exit 0 for each. Record the test counts.
- [ ] **Step 2:** Before/after comparison.
  - Run `git worktree add ../31_LifeDashboard-main main` and start that tree on separate ports against a copy of a scratch database that has spaces on Glass, Obsidian and Paper, a screen override and a widget on «No frame».
  - Take screenshots with the Orca built-in browser (`orca-cli`).
  - Start the feature branch on the same database copy (migration runs) and take the same screenshots.
  - Expected: mapped choices shown in every picker; Glass close to before; Paper and Obsidian changed as the spec states.
- [ ] **Step 3:** Manual check in the Orca browser on the feature branch:
  - Catppuccin, Gruvbox, GitHub and Solarized in both styles and both modes;
  - `auto` following a macOS appearance change;
  - a sandbox example widget (`examples/widgets/showcase-clock`) updating live;
  - the picker in the settings panel, the space picker, the screen popover and widget settings (Done/Cancel restores the screen choice);
  - semantic HTML in a test widget picking up `h2`, `small`, `a` and `code` styles.
- [ ] **Step 4:** Remove the comparison worktree (`git worktree remove ../31_LifeDashboard-main`). Report results, deviations and any palette tuned for contrast.
