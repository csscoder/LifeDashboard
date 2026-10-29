# LifeDashboard widget

This project is one LifeDashboard widget: the Vue 3 component `src/index.vue` and its manifest `widget.json`.
The output is the folder `dist/<id>-<version>/`, which the user imports.

Docs: `node_modules/@lifedashboard/widget-sdk/docs/index.md`, available after dependencies are installed.
Read it when a rule below is unclear or a task is not covered here.

## Rules behind most failures

- No browser storage (`localStorage`, `sessionStorage`, IndexedDB, cookies). Persist with `widget.state` and declare `state` in `permissions`.
- External HTTP only through `widget.http.get` and `widget.http.send`. Declare `network` in `permissions` and list each origin in `network`.
- Files only from the widget folder. fetch, XHR and WebSocket reach only the widget's own files.
- Media by URL from `assets/`: WebM (VP9 + Opus) for video, Opus for audio. Create `assets/` when you add media.
- Style with `var(--ld-…)` theme tokens only.
- Use semantic headings, paragraphs, lists, `small` and links; theme typography already styles them.
- Size EVERY length inside the widget in `em` (text, padding, gaps, widths, heights, icons, radii, `@container` thresholds), designing for 1em = 16px, so the user's text size scales the whole widget. Never `rem`, `px`, `vw` or `vh` for content; only 1–2px hairlines. Use `size-*` tokens; write `widget-padding`, `gap`, `control-height` and `radius-*` values in `em` (those tokens are `rem`). Multiply container units that size content by `var(--ld-content-scale, 1)`. See design.md, «Units and scaling».
- Text is not selectable by default: the runtime sets `user-select: none`, and text in inputs, textareas and `[contenteditable]` stays selectable. Enable selection (`user-select: text` and `-webkit-user-select: text`) only on the element whose text the user's task asks to be selectable or copyable, never on `body` or the widget root. See design.md, «Text selection».
- Use text-primary for headings/body, text-secondary for secondary text, text-muted for hints, `--ld-link` for links, accent-text for emphasis and status-text on status-subtle for status.
- Adapt to `context.size` and `context.sizeClass`. Read `context.frame`.
- Pause animation while `context.visible` is false.
- Object-like widgets (clocks, gauges, stickers) set `"frame": "frameless"` in `widget.json` and draw no card background.
- The widget root fills the frame: give it `height: 100%`. At the `default` size the essential content is visible without scrolling.
- Keep `title` and `id` in `widget.json` as created, unless the user asks to change them.
- Read only this project's files, the SDK docs and the `.d.ts` types. Do not read the compiled files of the SDK: the docs cover the dev shell URL, themes and limits.

## Widget UI

- The widget builds its own UI (buttons, inputs, lists, modal workspaces) in isolation, inside its sandbox. Dashboard components are not available there.
- Prefer a UI component library to hand-written controls: less code, with keyboard, focus and ARIA behavior included. For example, add `reka-ui` (headless Vue components) to `dependencies`; the build bundles it.
- Style library parts with `--ld-*` tokens. Without a library, style native elements (`<button>`, `<input>`, `<select>`) with `--ld-*` tokens; never leave the browser's default look.

## Settings and looks

- Declare user options (time zone, units, city) in `settings` in `widget.json`. The dashboard draws one settings panel for every widget. Do not build a settings form in the widget or in a modal.
- The settings panel behind the widget's gear belongs to the dashboard: version, Style (frame), Look, Shadow, the widget's `settings` and «Reset to defaults», drawn in one dashboard style that follows the screen theme. The widget cannot style or extend it; it only declares `settings`, `variants` and `frame`.
- The dashboard stores the values in its database per widget instance. Every plain setting needs `default`: the factory value that «Reset to defaults» restores.
- A colour option is a `color` setting with a `#rrggbb` `default`; the dashboard draws a colour picker for it.
- API keys and tokens are `secret` settings with `bind`. The widget sees only `true` or `false`.
- `settings` hold what the user chooses; `widget.state` holds data the widget produces.
- Several visual designs of one function (clock faces, hands, gauge styles) are one widget with `variants`, not several widgets. A variant changes the look only, never data or behavior. Draw every variant with `--ld-*` tokens. Read `context.variant`.
- Workflow step 1 also covers every variant.

## Workflow

1. `npx ld-widget dev`: open the shell at min, default and max size, in every theme, framed and frameless. Without a browser, run `npx ld-widget shot` and look at each image in `.ld-widget/shots/`.
2. After each change, read `.ld-widget/dev.log` and fix every entry in it.
3. `npx ld-widget check`: fix every problem it reports.
4. `npx ld-widget build`: writes `dist/<id>-<version>/`.
5. Hand over `dist/<id>-<version>/`. The user imports it with «Widgets → Choose folder».
