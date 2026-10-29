# Design

## Grid and sizing

- The dashboard grid has {{GRID_COLS}} columns. A widget has at most {{ROWS_MAX}} rows.
- Sizes in `sizing` and `context.size` are whole cells `{ w, h }`.
- `widget.json` `sizing` sets `min`, `default` and `max`. Each must fit in the grid, and `min` ≤ `default` ≤ `max`.
- `context.sizeClass` is `xs`, `s`, `m`, `l` or `xl`, from the smaller side of the size. Adapt the layout to `sizeClass` instead of checking `size` values. See [recipes.md](recipes.md).
- `html`, `body` and `#app` fill the widget rectangle, so `height: 100%` on the widget's root element is the full widget height.
- At the `default` size the essential content is visible without scrolling. Check `min` and `default` first, then `max`.
- Round or square content, such as a clock face or a gauge, sizes from the smaller side of the widget, so it fits when the widget is wider than tall or taller than wide. Give the root `container-type: size` and the content `width: min(100cqw, 100cqh); aspect-ratio: 1`. `width: 100%; height: 100%` on square content clips it in a non-square widget. See the clock in [recipes.md](recipes.md).

## em, rem and rootFontSize

- Size content text and spacing in `em`, or use the `size-*` tokens, so content follows its inherited typography. Use `rem` only for frame-independent values.
- `context.rootFontSize` is the dashboard's root font size in px. Use it only when a value must be a px number, such as a canvas size.
- The user scales widget content from 50 % to 150 %. Only `em` and `size-*` follow this scale; `rem` does not. A widget that sets its own `body` font size multiplies it by `var(--ld-content-scale)` to follow the setting. Read `context.contentScale` only when a px number is needed.

## Theme tokens

Every colour, radius, font, spacing and motion value comes from a theme token. Use `var(--ld-…)` with the full token name. Do not write literal colours, font names or durations.

A theme combines a palette, a mode (`light`, `dark` or `auto`, which follows the system colour scheme) and a style (`solid` or `glass`). The 11 palettes produce 44 combinations.

Read the current values from `context.theme.tokens`, or use the CSS variables directly. To see the widget in a theme, open the dev shell with its `theme` id ([workflow.md](workflow.md)). Tokens of the built-in themes:

{{THEME_TOKENS}}

Token groups:

- Surfaces: `bg`, `backdrop`, `scrim`, `surface-1`, `surface-1-solid`, `surface-2`, `surface-3`. `surface-1` may be translucent.
- States: `state-hover`, `state-active`, `state-selected` are translucent overlays on a surface.
- Text: `text-primary`, `text-secondary`, `text-muted`, `text-disabled`.
- Borders: `border-subtle`, `border-default`, `border-strong`, `border-width`.
- Accent and status: `accent*`, `on-accent`, and for each status `success`, `warning`, `danger`, `info`: `<status>`, `<status>-subtle`, `<status>-text`, `on-<status>`.
- Focus: `focus-ring`.
- Shape and effects: `radius-*`, `shadow-*`, `blur`, `glow`, `edge-highlight`.
- Type: `font-heading`, `font-body`, `font-ui`, `font-mono`, `font-display`, `font-scale`, `size-h1`, `size-h2`, `size-h3`, `size-body`, `size-small`, `weight-*`, `leading`, `leading-heading`, `tracking`.
- Links: `link`.
- Motion: `duration-*`, `ease-*`.
- Spacing: `widget-padding`, `gap`, `control-height`.

Text must keep readable contrast in every theme. Put `text-*` on `surface-*` tokens, and `on-accent` on `accent`.

## Typography and content

Use semantic elements: headings, paragraphs, lists, `small` and links are already styled with theme typography. Size content text and spacing in `em` or with `size-*` tokens. The user's heading and body fonts arrive through `--ld-font-heading` and `--ld-font-body`, so widgets never load fonts themselves. Use only `--ld-*` colours, choosing the role that matches the content:

| Content | Token |
| --- | --- |
| Heading or body | `text-primary` |
| Secondary text | `text-secondary` |
| Hint | `text-muted` |
| Link | `link` |
| Emphasis | `accent-text` |
| Status | `<s>-text` on `<s>-subtle` (`success`, `warning`, `danger`, `info`) |

For example, the last three Telegram threads can use semantic cards:

```html
<ul class="threads">
  <li><small>Design team</small><h3>New dashboard ideas</h3><a href="https://t.me/design/101">Read thread</a></li>
  <li><small>Book club</small><h3>Next month's reading</h3><a href="https://t.me/books/102">Read thread</a></li>
  <li><small>Weekend group</small><h3>Saturday plans</h3><a href="https://t.me/weekend/103">Read thread</a></li>
</ul>
```

```css
.threads { display: grid; gap: 0.75em; list-style: none; padding: 0; }
.threads li { background: var(--ld-surface-2); border-radius: var(--ld-radius-card); padding: 0.75em; }
.threads h3 { color: var(--ld-text-primary); }
.threads small { color: var(--ld-text-secondary); }
.threads a { color: var(--ld-link); }
```

## Framed and frameless

- `framed` (default): the host draws the card around the widget. The widget draws its content only.
- `frameless` (manifest `frame`, needs sdk 3): the host draws no card. The widget draws its own background, or none.
- Declare `"frame": "frameless"` for object-like widgets: clocks, gauges and stickers. Such a widget draws no card background.
- Read `context.frame` when the widget must change its styling by frame.

## Widget UI

The widget builds its own UI (buttons, inputs, lists, modal workspaces) in isolation, inside its sandbox. Dashboard components are not available there; the dashboard draws only the widget settings panel (see [settings.md](settings.md#who-draws-the-panel)) and the modal frame.

- Prefer a UI component library to hand-written controls: less code, with keyboard, focus and ARIA behavior included. Pick a library of unstyled (headless) Vue components that lists `vue` as a peer dependency, for example [reka-ui](https://reka-ui.com). Add it to the widget's `dependencies`; the build bundles it within the code limit of {{CODE_BYTES}} bytes. See [runtime.md](runtime.md#dependencies).
- Style library parts with `--ld-*` tokens, like every other element of the widget.
- Without a library, use native elements (`<button>`, `<input>`, `<select>`) and style them with `--ld-*` tokens. Never leave the browser's default look.
- User options are not widget UI: declare them in `settings` and the dashboard draws them. See [settings.md](settings.md).

## Looks (variants)

Several visual designs of one function (clock faces, hands, gauge styles) are one widget with `variants`, not several widgets. A variant changes the look only, never data or behavior. Draw every variant with `--ld-*` tokens. Read `context.variant`, which updates reactively when the user changes the Look selector in the dashboard's settings panel.

Declare `variants` in `widget.json` (sdk 5). It has `default` and `items`, with 2 to {{VARIANTS_MAX}} entries. Each item has a distinct `id` matching `^[a-z][a-z0-9-]{0,31}$` and a plain-text `title` of 1 to {{TITLE_MAX}} characters. `default` must name an item. Missing or unknown stored ids resolve to the default; without variants, `context.variant` is an empty string.

For a clock, add this manifest field:

```json
"variants": {
  "default": "classic",
  "items": [
    { "id": "classic", "title": "Classic" },
    { "id": "minimal", "title": "Minimal" },
    { "id": "roman", "title": "Roman" }
  ]
}
```

Switch the face in `src/index.vue` while sharing the same time and settings:

```vue
<script setup lang="ts">
import { useWidget } from '@lifedashboard/widget-sdk'
import ClassicFace from './ClassicFace.vue'
import MinimalFace from './MinimalFace.vue'
import RomanFace from './RomanFace.vue'

const { context } = useWidget()
</script>

<template>
  <MinimalFace v-if="context.variant === 'minimal'" />
  <RomanFace v-else-if="context.variant === 'roman'" />
  <ClassicFace v-else />
</template>
```

Each face uses theme tokens and fits the widget rectangle. Workflow step 1 also covers every variant: check each look at min, default and max size, in every theme, framed and frameless.
