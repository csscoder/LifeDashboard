# Audit fixes — frozen outcome

Feature ID: audit-fixes
Status: complete
Completed at: 2026-10-27
Archived at: 2026-10-27
Archive revision: 1

## Implemented scope and outcomes
- Auth, Host and Origin checks and the sandbox Host check read `request.routeOptions.url`, so an encoded path such as `/%61pi/v1/spaces` no longer skips them (8a07e21).
- A widget modal survives a board reload that replaces `source` with an equal object (9649e9d).
- A save conflict on «Done» keeps edit mode and the edits and shows the conflict notice; «Cancel» reloads (96e226b).
- Rejected gateway calls spend the rate limit (`REJECTED_LIMIT` 60/min for unknown ops), a wrong confirmation id spends a unit, `RATE_LIMITED` writes no audit row (119b4d9, 91c095f).
- The widget audit is purged hourly and indexed by `at` (746beec).
- Three user declines block a widget's confirmation requests for 5 minutes with one toast; teardown and expiry do not count (0a8e4d5).
- Confirmations show `packageId · version` or «Built-in»; toasts show `title · packageId`; widget modals show «Third-party widget · packageId» (99748d9, bf44916).
- `isPlainText` and space titles reject blank text, C1 controls, zero-width space, direction marks, embeddings, overrides, isolates and line/paragraph separators; ZWJ and ZWNJ stay allowed (393f50b).
- With `LIFEDASHBOARD_EXIT_ON_STDIN_EOF=1` the API exits on stdin end; the desktop sidecar gets a piped stdin and the variable, and an early start error shows «LifeDashboard could not start» (2fa9736, da2dd4a, bf44916).
- `ld-widget build` skips dotfiles in `assets/` (053519c).
- `modal.open` treats `undefined` options as absent; header values outside Latin-1 are `INVALID_INPUT`; new manifests need canonical versions while stored `01.0.0` packages keep working (fe19311, 5313c67).
- create-widget names why a title has no slug (121e773).
- Approved host names that resolve to a private, loopback, link-local, multicast or IPv4-mapped private address are refused at connect time through an undici `Agent` lookup; literal IP origins and `localhost` stay allowed (9f93a38).
- Dead code removed and the theme contract wording fixed (ddf2c80).

## Accepted decisions
- Finding 17 (theme validator) withdrawn: `validateThemeCss` guards built-in theme contrast in tests.
- `undici` 8.11.2 is the only new dependency, in `packages/contracts`; both the SDK CLI and the API bundle inline it.
- A conflict reaction equals `afterStaySave('conflict')`.
- A declined confirmation writes only the `CONFIRMATION_REQUIRED` row; the decline route writes no `DECLINED` row, so audit rows stay within twice the sum of the limits.

## Deviations from plan
- Task 10: the early start error uses `show(...)` with `exit(1)` on dismissal instead of `blocking_show()`, which must not run on the main thread during `setup`.
- Task 1: unknown `/api/...` paths answer 404 without the session and Host checks (no route is matched); before they answered 401.
- Task 4: an approval repeat after the grant switched to «allow» consumes the pending id without a second limit unit (91c095f).
- Task 6: `confirmations.ts` imports `./toasts.js` because SDK tests compile it under NodeNext (01fda3f).
- Header error text names Latin-1 and the range uses `ÿ` (5313c67).

## Archived source map
- `docs/superpowers/specs/2026-10-27-audit-fixes-design.md` → [spec](spec.md)
- `docs/superpowers/plans/2026-10-27-audit-fixes.md` → [plan](plan.md)

## Verification
- `pnpm typecheck` and `pnpm test` at 5313c67: all packages pass (contracts 609, widget-sdk 388, ui 722, api 404, create-widget 51, examples 136 tests).
- `pnpm -C packages/widget-sdk build`, `pnpm -C apps/api build:bundle`, `pnpm -C apps/api smoke:bundle`: pass; undici is bundled, not imported.
- Live API from the branch with the built UI: `/%61pi/v1/spaces` → 401; encoded POST with a foreign Host → 403; encoded sandbox path with a foreign Host → 403; `/%2561pi/...` and `//api/...` → SPA HTML, no data.
- Orca browser, two tabs: «Done» after a save in the other tab keeps edit mode, the edits and the notice; a second «Done» repeats it; «Cancel» loads the other tab's board.
- Orca browser: an installed package widget modal stays open after a board reload triggered by `visibilitychange` and shows «Third-party widget · dev.lifedashboard.showcase.counter». Orca does not hide a tab on switch, so the event was dispatched by script.
- `cargo check` and `cargo test` (5 tests) for `apps/desktop/src-tauri`: pass, no warnings.
- `pnpm -C apps/desktop run package`: builds `LifeDashboard.app` and the dmg.
- Built app with a temporary `HOME`: after `kill -9` of the app the Node sidecar exited within 0.5 s and port 3101 was free.
- Built app with the data folder replaced by a file: the dialog «LifeDashboard could not start» / «Not a directory (os error 20)» appeared (seen by the owner); after OK the app exited with code 1.

## Review
- Whole-branch review by the executing agent; findings fixed in bf44916.
- Re-check of the branch against the plan in the planning session; one finding fixed in 5313c67.

## Consciously excluded scope
- Space titles still accept C0 controls `\u0000-\u001f`; the spec covers only the hidden-text classes.
- Stored data (installed manifests, versions, saved titles) is not re-validated.
