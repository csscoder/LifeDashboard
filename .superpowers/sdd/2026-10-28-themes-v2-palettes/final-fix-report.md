# Final review fix report

Addressed all three findings in one fix wave.

- ThemePicker now displays the inherited palette name beside the Inherit radio. Its accessible name stays Inherit; existing Mode and Style controls keep their selected inherited values and disabled state. No layout dimensions changed.
- The custom SFC renderer checks event.cancelBubble before propagating to either a parent node or window. A focused child/parent test covers stopped and ordinary bubbling.
- A real API regression saves builtin:nord (an unavailable palette), patches only the space title, then GETs the spaces and verifies the structured theme remains unchanged.

TDD: new picker and renderer tests were run before implementation; both failed on the intended missing behavior. API coverage exercises behavior already implemented, so no API production change was needed.

Verification: all commands below completed with exit 0 except the intentional red run (Vitest exit 1). git diff --check passed. No browser work was required for this focused text/helper change.

## pnpm -C apps/ui test test/theme-picker.test.ts test/sfc-renderer.test.ts (before fixes)

```text

> @lifedashboard/ui@ test /Users/csscoder/.codex/worktrees/6e84/31_LifeDashboard/apps/ui
> vitest run test/theme-picker.test.ts test/sfc-renderer.test.ts


 RUN  v5.0.3 /Users/csscoder/.codex/worktrees/6e84/31_LifeDashboard/apps/ui

 ❯ test/sfc-renderer.test.ts (2 tests | 1 failed) 8ms
   × bubbles child clicks only when propagation is not stopped (true) 3ms
 ❯ test/theme-picker.test.ts (11 tests | 1 failed) 157ms
   × shows the inherited palette while retaining inherited mode and style 12ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  test/sfc-renderer.test.ts > bubbles child clicks only when propagation is not stopped (true)
AssertionError: expected [ 'child', 'parent' ] to deeply equal [ 'child' ]

- Expected
+ Received

  [
    "child",
+   "parent",
  ]

 ❯ test/sfc-renderer.test.ts:11:17
      9|   ]) }, {}, [])
     10|   ui.button('Child').click()
     11|   expect(calls).toEqual(stopped ? ['child'] : ['child', 'parent'])
       |                 ^
     12| })
     13|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  test/theme-picker.test.ts > shows the inherited palette while retaining inherited mode and style
AssertionError: expected '  v-if  v-if' to contain 'Gruvbox'

Expected: "Gruvbox"
Received: "  v-if  v-if"

 ❯ test/theme-picker.test.ts:100:63
     98|   const inherit = ui.button('Inherit')
     99|   expect(inherit.props['aria-checked']).toBe(true)
    100|   expect(inherit.parent!.children.map(n => n.text).join(' ')).toContai…
       |                                                               ^
    101|   for (const value of ['light', 'glass']) {
    102|     const radio = ui.nodes().find(n => n.props.role === 'radio' && n.p…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  2 failed (2)
      Tests  2 failed | 11 passed (13)
   Start at  15:11:07
   Duration  866ms (import 75%, tests 16%, transform 9%)

 ELIFECYCLE  Test failed. See above for more details.
```

## pnpm -C apps/ui test test/theme-picker.test.ts test/sfc-renderer.test.ts

```text

> @lifedashboard/ui@ test /Users/csscoder/.codex/worktrees/6e84/31_LifeDashboard/apps/ui
> vitest run test/theme-picker.test.ts test/sfc-renderer.test.ts


 RUN  v5.0.3 /Users/csscoder/.codex/worktrees/6e84/31_LifeDashboard/apps/ui


 Test Files  2 passed (2)
      Tests  13 passed (13)
   Start at  15:11:14
   Duration  809ms (import 75%, tests 15%, transform 9%)

```

## pnpm -C apps/api test test/spaces.test.ts

```text

> @lifedashboard/api@ test /Users/csscoder/.codex/worktrees/6e84/31_LifeDashboard/apps/api
> vitest run test/spaces.test.ts


 RUN  v5.0.3 /Users/csscoder/.codex/worktrees/6e84/31_LifeDashboard/apps/api


 Test Files  1 passed (1)
      Tests  70 passed (70)
   Start at  15:11:16
   Duration  1.11s (tests 75%, transform 12%, import 12%)

```

## pnpm test

```text

> lifedashboard@ test /Users/csscoder/.codex/worktrees/6e84/31_LifeDashboard
> pnpm -r --if-present run test

Scope: 11 of 12 workspace projects
packages/contracts test$ vitest run
packages/contracts test:  RUN  v5.0.3 /Users/csscoder/.codex/worktrees/6e84/31_LifeDashboard/packages/contracts
packages/contracts test:  Test Files  16 passed (16)
packages/contracts test:       Tests  656 passed (656)
packages/contracts test:    Start at  15:11:20
packages/contracts test:    Duration  790ms (transform 45%, tests 35%, import 16%, worker 3%)
packages/contracts test: Done
packages/widget-sdk test$ vitest run
packages/widget-sdk test:  RUN  v5.0.3 /Users/csscoder/.codex/worktrees/6e84/31_LifeDashboard/packages/widget-sdk
packages/widget-sdk test:  Test Files  22 passed (22)
packages/widget-sdk test:       Tests  403 passed (403)
packages/widget-sdk test:    Start at  15:11:21
packages/widget-sdk test:    Duration  10.07s (tests 89%, import 7%, transform 4%)
packages/widget-sdk test: Done
apps/api test$ vitest run
apps/ui test$ vitest run
examples/widgets/showcase-counter test$ vitest run --exclude dist/**
examples/widgets/showcase-clock test$ vitest run --exclude dist/**
examples/widgets/showcase-counter test:  RUN  v5.0.3 /Users/csscoder/.codex/worktrees/6e84/31_LifeDashboard/examples/widgets/showcase-counter
apps/ui test:  RUN  v5.0.3 /Users/csscoder/.codex/worktrees/6e84/31_LifeDashboard/apps/ui
examples/widgets/showcase-clock test:  RUN  v5.0.3 /Users/csscoder/.codex/worktrees/6e84/31_LifeDashboard/examples/widgets/showcase-clock
apps/api test:  RUN  v5.0.3 /Users/csscoder/.codex/worktrees/6e84/31_LifeDashboard/apps/api
examples/widgets/showcase-clock test:  Test Files  3 passed (3)
examples/widgets/showcase-clock test:       Tests  12 passed (12)
examples/widgets/showcase-clock test:    Start at  15:11:32
examples/widgets/showcase-clock test:    Duration  346ms (transform 50%, import 37%, tests 10%, worker 3%)
examples/widgets/showcase-clock test: Done
examples/widgets/showcase-weather test$ vitest run --exclude dist/**
examples/widgets/showcase-weather test:  RUN  v5.0.3 /Users/csscoder/.codex/worktrees/6e84/31_LifeDashboard/examples/widgets/showcase-weather
examples/widgets/showcase-counter test:  Test Files  2 passed (2)
examples/widgets/showcase-counter test:       Tests  24 passed (24)
examples/widgets/showcase-counter test:    Start at  15:11:32
examples/widgets/showcase-counter test:    Duration  970ms (import 54%, transform 26%, tests 19%)
examples/widgets/showcase-counter test: Done
packages/create-widget test$ vitest run
packages/create-widget test:  RUN  v5.0.3 /Users/csscoder/.codex/worktrees/6e84/31_LifeDashboard/packages/create-widget
examples/widgets/showcase-weather test:  Test Files  2 passed (2)
examples/widgets/showcase-weather test:       Tests  74 passed (74)
examples/widgets/showcase-weather test:    Start at  15:11:33
examples/widgets/showcase-weather test:    Duration  876ms (tests 68%, transform 18%, import 13%, worker 1%)
examples/widgets/showcase-weather test: Done
apps/ui test:  Test Files  56 passed (56)
apps/ui test:       Tests  967 passed (967)
apps/ui test:    Start at  15:11:32
apps/ui test:    Duration  5.30s (import 61%, tests 28%, transform 10%, worker 1%)
apps/ui test:     Isolate  56 workers spawned · ~128ms startup each (spawn + environment, per file)
apps/ui test:              at least ~668ms faster with isolate: false — reuses workers across files instead of one per file
apps/ui test: Done
apps/api test:  Test Files  15 passed (15)
apps/api test:       Tests  401 passed (401)
apps/api test:    Start at  15:11:32
apps/api test:    Duration  6.71s (tests 75%, transform 13%, import 12%)
apps/api test: Done
packages/create-widget test:  Test Files  4 passed (4)
packages/create-widget test:       Tests  51 passed (51)
packages/create-widget test:    Start at  15:11:33
packages/create-widget test:    Duration  6.22s (tests 86%, transform 10%, import 4%)
packages/create-widget test: Done
```

## pnpm -C apps/ui typecheck

```text

> @lifedashboard/ui@ typecheck /Users/csscoder/.codex/worktrees/6e84/31_LifeDashboard/apps/ui
> nuxt typecheck

```
