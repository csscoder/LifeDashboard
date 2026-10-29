# Theme fonts: self-hosted heading and body families

Status: design approved in chat on 2026-10-29; Codex review approved (2 rounds); written spec awaiting user review.

Sub-project 2 of 3 of the appearance rework. Sub-project 1 (palettes × modes × styles, content typography) is merged: `docs/superpowers/specs/2026-10-28-themes-v2-palettes-design.md`. Sub-project 3 adds a per-widget content scale and gets its own spec.

## Goal

1. The user picks a heading font and a body font from a built-in set of Google Fonts families, as part of the theme choice at any of the four scopes.
2. The fonts render in the dashboard and inside sandboxed SDK widgets, offline, with Latin and Cyrillic text.
3. Widgets need no code to follow the choice: they already use `var(--ld-font-heading)` and `var(--ld-font-body)`.

## Current state (2026-10-29)

- `ThemeChoice` is `{ palette, mode, style }` (`packages/contracts/src/theme.ts`); `isThemeChoice` accepts exactly these three keys. It is stored as JSON in `spaces.theme`, `screens.theme`, `widgets.appearance.theme`, and browser appearance storage (schema version 2).
- `resolveTheme(chain, scheme)` (`apps/ui/app/theme/resolve.ts`) returns the combination id of the first choice with a known palette; `resolveWidgetLook` gives a widget its own id or the board's.
- The generator sets `font-heading`, `font-body`, `font-ui` and `font-display` to `system-ui, sans-serif` in every combination rule of `generated.css` (layer `ld.theme`, classes `space--theme-<key>` and `widget--theme-<key>`).
- `readThemeTokens()` reads the computed contract tokens from the widget frame and sends them to the sandbox, which applies them to its root. `content.css` and `frame.css` already use `--ld-font-heading` and `--ld-font-body`.
- The sandbox runtime (`packages/widget-sdk/src/sandbox.ts`) injects `content.css` (imported `?raw`) into a `<style>`. The sandbox CSP (`packages/contracts/src/sandbox-document.ts`) has `font-src ${packageDir} data:`. The API serves `/sandbox/runtime/<vue.js|sdk.js>` and adds `Access-Control-Allow-Origin: *` to every `/sandbox/*` route. `apps/api/scripts/copy-runtime.mjs` copies the runtime files next to the desktop API bundle (`LIFEDASHBOARD_RUNTIME_DIR`).
- The theme validator accepts a font stack of quoted family names from `[A-Za-z0-9 _-]` plus generic families.

## External facts

Checked on 2026-10-29 with Perplexity.

- The Google Fonts CSS2 API (`https://fonts.googleapis.com/css2?family=Inter:wght@100..900`) returns one `@font-face` per script subset (`latin`, `cyrillic`, …), each with its own WOFF2 URL and `unicode-range`. It negotiates the format by User-Agent; a modern browser UA gets WOFF2. Sources: https://developers.google.com/fonts/docs/css2, https://developers.google.com/fonts/faq.
- A user agent downloads a face only when the page uses codepoints in its `unicode-range`, so declaring every face costs nothing until it is used. Source: CSS Fonts Level 4, https://www.w3.org/TR/css-fonts-4/.
- `@font-face` fetches are CORS requests. A sandboxed frame has an opaque origin, so font responses need `Access-Control-Allow-Origin: *`. Sources: CSS Fonts Level 4; https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS.
- Unchanged WOFF2 files may be redistributed under the SIL OFL 1.1 together with the family's `OFL.txt`. Source: https://openfontlicense.org/ofl-faq/.
- Preliminary (single source; the fetch script verifies it): the twelve families below are variable on `wght`, OFL-licensed and include the `cyrillic` subset. Roboto was excluded because it is Apache-2.0, and Spectral, PT Serif, IBM Plex Sans and Fira Sans because they are static. Source: https://fonts.google.com/metadata/fonts.

## Decisions

| Topic | Decision |
| --- | --- |
| Catalog | A built-in set of 12 families; no runtime access to Google Fonts. |
| Scripts | Every family has Latin and Cyrillic. Only the `latin` and `cyrillic` subsets are shipped. |
| Model | Fonts are part of the theme choice: optional `heading` and `body` keys, inherited with the whole choice at the four scopes. |
| Delivery | A one-off dev script downloads WOFF2 files and licences and generates `fonts.css`; the result is committed (approach A). `@fontsource` packages and `data:` URIs were rejected. |
| Application | Inline custom properties on the scope root and on each widget frame. No font classes, no new CSS layer. |
| Dependencies | None added. |

## Catalog (`apps/ui/app/theme/fonts.ts`)

```ts
interface FontFamily {
  slug: string                      // ^[a-z][a-z0-9-]{0,31}$
  name: string                      // Google Fonts family name, matches [A-Za-z0-9 _-]+
  fallback: 'sans-serif' | 'serif'
  weight: [min: number, max: number] // the family's wght axis range
}
export const BUILTIN_FONTS: readonly FontFamily[]
export const BUILTIN_FONT_SLUGS: ReadonlySet<string>
export function fontStack(font: FontFamily): string // `'Inter', system-ui, sans-serif`
```

| Group | Families (slug) |
| --- | --- |
| Sans | Inter (`inter`), Golos Text (`golos-text`), Onest (`onest`), Manrope (`manrope`), Montserrat (`montserrat`), Nunito (`nunito`), Rubik (`rubik`) |
| Display | Unbounded (`unbounded`) |
| Serif | Lora (`lora`), Literata (`literata`), Playfair Display (`playfair-display`), EB Garamond (`eb-garamond`) |

Weight ranges are copied from each family's Google Fonts metadata at implementation time. Upright only: italics are synthesized by the browser.

## Contract

`ThemeChoice` gains two optional keys:

```ts
interface ThemeChoice {
  palette: string
  mode: ThemeMode
  style: ThemeStyle
  heading?: string // font slug; absent: the theme's default font
  body?: string
}
```

- `isThemeChoice` accepts the three required keys plus any of `heading` and `body`. Each present font key must be a string matching `^[a-z][a-z0-9-]{0,31}$`; `null` and other keys are rejected.
- An absent key is the only representation of «theme default». Choices emitted by the UI use the key order `palette, mode, style, heading, body`.
- Existing three-key choices stay valid. No database or storage migration is needed.
- A syntactically valid unknown slug (for example a family removed later) is stored unchanged and renders the theme default, the same rule as an unknown palette.

## Resolution and application

- `resolveTheme` picks the effective choice as today. A pure helper `fontVars(choice: ThemeChoice | null): Record<string, string>` maps a known `heading` to `--ld-font-heading` and `--ld-font-display`, and a known `body` to `--ld-font-body` and `--ld-font-ui`, each with `fontStack()`. Unknown or absent keys produce no entry.
- `app.vue` binds `fontVars(<effective board choice>)` as the inline `style` of the `.space` root.
- `resolveWidgetLook` also returns the widget's font variables: from the widget's own choice when it has a known palette, otherwise from the board's effective choice. Bare widgets use the board's. `WidgetFrame` binds them as the inline `style` of its root `.widget` element, the element that carries the theme class and that `readThemeTokens()` reads; the existing `wrapperStyle` on `.widget__wrapper` stays for the shadow. A frame needs its own variables because its `widget--theme-<key>` rule resets the font tokens to `system-ui`.
- Inline custom properties win over the theme class on the same element, so no layer or class is added. `readThemeTokens()` reads computed values, so `context.theme.tokens` carries the chosen stacks into the sandbox.
- `useWidgetContext` re-reads tokens today only when `themeId` or `foreign` changes. Its source gains `fonts: () => string` (the serialized font variables), and the post-flush watch covers `[themeId, foreign, fonts]`, so changing or resetting only a font updates an open sandbox widget.
- Fonts do not change the combination id or `foreign`.

## Files and serving

### Fetch script (`apps/ui/scripts/fetch-fonts.ts`, `pnpm -C apps/ui fetch:fonts`)

For each catalog family:

1. Request `https://fonts.googleapis.com/css2?family=<Name>:wght@<min>..<max>&display=swap` with a current desktop Chrome User-Agent.
2. Keep the `latin` and `cyrillic` faces (identified by the `/* latin */` and `/* cyrillic */` comments). Fail with the family name when either is missing.
3. Download each WOFF2 to `apps/ui/app/theme/fonts/<slug>-<subset>.woff2`, and `https://raw.githubusercontent.com/google/fonts/main/ofl/<dir>/OFL.txt` to `apps/ui/app/theme/fonts/<slug>.OFL.txt` (`<dir>` is the family name lower-cased without spaces).
4. Write `apps/ui/app/theme/styles/fonts.css`: a «generated, do not edit» header, then one `@font-face` per file with `font-family: '<Name>'`, `font-style: normal`, `font-weight: <min> <max>`, `font-display: swap`, `src: url(../fonts/<file>) format('woff2')` and the upstream `unicode-range`.

The script runs only when the catalog changes; its output is committed. Normal builds and tests never touch the network.

### Host

`layers.css` imports `fonts.css` (outside any layer; `@font-face` is not cascaded). Vite copies and fingerprints the referenced WOFF2 files.

### Sandbox

- API: `GET /sandbox/runtime/fonts/:file` accepts only `^[a-z0-9-]+\.woff2$` and serves `font/woff2` with `cache-control: no-cache`: the URL is stable while the fetch script may replace a file, so the browser revalidates. It reads from `$LIFEDASHBOARD_RUNTIME_DIR/fonts/` when set, otherwise from `apps/ui/app/theme/fonts/`. Other names and missing files give 404. The existing `/sandbox/*` hook adds `Access-Control-Allow-Origin: *` and the host and origin checks.
- `copy-runtime.mjs` copies `apps/ui/app/theme/fonts/*.woff2` and `*.OFL.txt` to `dist-bundle/runtime/fonts/`, so the desktop app, which bundles `dist-bundle`, ships every licence with the fonts; `smoke-bundle.mjs` also requests one font.
- Runtime: `sandbox.ts` imports `fonts.css?raw`, replaces `url(../fonts/` with the absolute `new URL('fonts/', import.meta.url)` and appends it to the existing injected `<style>`.
- CSP: `font-src ${packageDir} ${runtime}fonts/ data:`.
- Document cache: the sandbox document (`/sandbox/packages/:hash/`) is served today with a one-year `immutable` cache, so a browser would keep a cached document with the old CSP. The document response switches to `cache-control: no-cache` (it is generated and cheap), and `SandboxWidget.vue` loads it as `/sandbox/packages/<hash>/?doc=2` once, so documents cached before this change are never reused. Package files keep the immutable cache.

Expected size: 24 WOFF2 files, estimated at 1–1.5 MB in total; the plan records the measured size.

## Theme picker UI

Below the Style group, `ThemePicker.vue` gets two `UiSelect` rows, `Heading font` and `Body font`. Options: `Theme default`, then the 12 families by name.

- Choosing `Theme default` removes the key; choosing a family sets its slug. Mode, style and the other font key are kept.
- A sample line under the selects shows «Heading Заголовок» in the heading stack and «Body text Текст 123» in the body stack of the effective choice.
- With Inherit or No frame selected, both rows are disabled, like Mode and Style. Choosing a palette tile from Inherit or No frame copies mode, style and fonts from `inherited`.
- A choice with an unknown font slug shows `Theme default` for that row.
- The four places using the picker (settings panel, space picker, screen popover, widget settings) need no change beyond what the picker emits.

## Error handling

| Case | Behaviour |
| --- | --- |
| Unknown or removed slug | Theme default font; the stored value is not rewritten. |
| Invalid `heading`/`body` in a board PUT or space PATCH (not a slug, `null`, extra key) | 400 with the existing `invalid screen theme`, `invalid space theme` or `invalid widget appearance` message. |
| WOFF2 fails to load | `font-display: swap` and the stack's `system-ui` fallback render the text. |
| Fetch script: family without `cyrillic` or `latin`, or HTTP error | The script throws with the family name and writes nothing. |
| `/sandbox/runtime/fonts/` with traversal or another extension | 404. |

## SDK and documentation

- `packages/widget-sdk/docs-src/design.md`, «Typography and content»: one sentence that heading and body fonts follow the user's theme through `--ld-font-heading` and `--ld-font-body`, so widgets never load fonts themselves. Regenerate `docs/`.
- `docs/theme-contract.md`: the optional `heading`/`body` keys, the catalog, the fetch script, the generated `fonts.css` and the inline application.
- `README.md` Appearance row: mention heading and body fonts.
- The dev shell (`ld-widget dev`) and `ld-widget shot` are unchanged: their themes use `system-ui`.

## Testing

- `packages/contracts/test/theme.test.ts`: `isThemeChoice` accepts `heading`/`body` slugs and three-key choices; rejects `null`, `'Inter'`, `'inter '` and extra keys; `readTheme` keeps font keys.
- `apps/ui/test/theme-fonts.test.ts` (new): every catalog slug has `<slug>-latin.woff2`, `<slug>-cyrillic.woff2` and `<slug>.OFL.txt`; `fonts.css` has exactly one `@font-face` per file with the catalog name and weight range; `fontStack` output passes the validator's font-stack check; `fontVars` for known, unknown and absent keys.
- `apps/ui/test/theme-resolve.test.ts`: a widget with its own palette and no fonts does not inherit the board fonts; an inheriting and a bare widget get the board fonts.
- `apps/ui/test/theme-picker.test.ts`: selecting a family emits the slug with the key order above; `Theme default` removes it; rows are disabled for Inherit and No frame; unknown slug shows `Theme default`.
- `apps/ui/test/app-theme.test.ts`: the `.space` root gets the inline font variables of the effective choice.
- `apps/ui/test/widget-context.test.ts`: changing only the heading font, and then resetting it to the theme default, sends new `context.theme.tokens` with the same `id`.
- `apps/ui/test/widget-host.test.ts` (or the `WidgetFrame` test): the root `.widget` element carries the font variables and the computed tokens read from it contain them.
- `apps/api/test/sandbox.test.ts`: the font route serves `font/woff2` with `access-control-allow-origin: *`, with `cache-control: no-cache`, and returns 404 for `..%2F`, `x.ttf` and a missing file; the sandbox document is served with `cache-control: no-cache`. `apps/api` bundle smoke requests one font, and `copy-runtime` output contains every `<slug>.OFL.txt`.
- `packages/contracts/test/sandbox-document.test.ts`: `font-src` contains `${runtime}fonts/`.
- `packages/widget-sdk/test/sandbox-root.test.ts`: the injected `<style>` contains `@font-face` with an absolute `…/sandbox/runtime/fonts/` URL.
- Manual, in the Orca browser: a heading and body pair on a space, a different pair on a widget, Cyrillic and Latin text in a built-in and a sandbox widget, and the desktop bundle smoke.

## Out of scope

- Runtime access to the Google Fonts catalog and user font uploads.
- Italic files, `latin-ext` and `cyrillic-ext` subsets, and a selectable monospace font.
- Font previews inside the select options.
- Font selection in the SDK dev shell and `ld-widget shot`.
- The per-widget content scale (sub-project 3).
