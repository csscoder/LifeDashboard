# Audit fixes — frozen outcome

Feature ID: audit-fixes
Status: completed
Completed at: 2026-10-27
Archived at: 2026-10-27T15:43:30Z
Skill: archive-plan 1.1.1
Archive revision: 1

## Implemented scope and outcomes
- Auth, Host/Origin and sandbox Host checks use the matched route (request.routeOptions.url), closing the encoded-path bypass (8a07e21). (evidence: [ev-session-review], [ev-session-verify])
- A widget modal survives a board reload with an equal source; a save conflict keeps edit mode and edits (9649e9d, 96e226b). (evidence: [ev-session-review], [ev-session-verify])
- Rejected gateway calls and wrong confirmation ids spend the rate limit; RATE_LIMITED writes no audit row; hourly audit purge and index on at (119b4d9, 91c095f, 746beec). (evidence: [ev-session-review])
- Three user declines block a widget for 5 minutes; confirmations, toasts and modals identify the package (0a8e4d5, 99748d9, bf44916). (evidence: [ev-session-review])
- Plain text and space titles reject blank and hidden control text, keeping ZWJ/ZWNJ (393f50b). (evidence: [ev-session-review])
- API exits on stdin EOF when LIFEDASHBOARD_EXIT_ON_STDIN_EOF=1; desktop pipes stdin, sets the variable and shows early start errors (2fa9736, da2dd4a, bf44916). (evidence: [ev-session-review], [ev-session-verify])
- SDK build skips dotfiles in assets; modal options accept undefined; non-Latin-1 headers rejected; new manifests need canonical versions; create-widget names the slug reason (053519c, fe19311, 121e773, 5313c67). (evidence: [ev-session-review])
- Approved host names resolving to private addresses are refused at connect time via an undici Agent lookup; literal IPs and localhost stay allowed (9f93a38). (evidence: [ev-session-review], [ev-session-verify])
- Dead helpers removed and theme contract wording fixed (ddf2c80). (evidence: [ev-session-review])

## Accepted decisions
- Finding 17 (theme validator) withdrawn: validateThemeCss guards built-in theme contrast in tests. (evidence: [ev-session-review])
- undici 8.11.2 is the only new dependency, in packages/contracts; both bundles inline it. (evidence: [ev-session-review], [ev-session-verify])
- A declined confirmation writes only the CONFIRMATION_REQUIRED row, so audit rows stay within twice the sum of the limits. (evidence: [ev-session-review])

## Archived source map
Original links inside preserved documents are unchanged; linked external documents are not bundled.
- `docs/superpowers/specs/2026-10-27-audit-fixes-design.md` → [spec](spec.md)
- `docs/superpowers/plans/2026-10-27-audit-fixes.md` → [plan](plan.md)

## Areas and modules
Not recorded.

## Git state
Repository root: .
Branch: main
HEAD commit: 1edb493213662a0fb3e94a3113b4287401302087
Describe: 1edb493
Working tree: clean

## Implementation evidence
Reported status: completed; evidence: [ev-session-review].

## Verification
Reported status: passed.
- Command/check: pnpm typecheck
  Result: passed; exit code: 0; evidence: [ev-session-verify].
- Command/check: pnpm test
  Result: passed; exit code: 0; evidence: [ev-session-verify].
- Command/check: pnpm -C apps/api build:bundle && pnpm -C apps/api smoke:bundle
  Result: passed; exit code: 0; evidence: [ev-session-verify].
- Command/check: cargo check and cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
  Result: passed; exit code: 0; evidence: [ev-session-verify].
- Command/check: pnpm -C apps/desktop run package
  Result: passed; exit code: 0; evidence: [ev-session-verify].
- Command/check: Live curl probes of encoded API and sandbox paths on the branch API
  Result: passed; exit code: not recorded; evidence: [ev-session-verify].
- Command/check: Orca two-tab save conflict and widget modal reload checks
  Result: passed; exit code: not recorded; evidence: [ev-session-verify].
- Command/check: Built desktop app: kill -9 ends the sidecar; early start error shows the dialog
  Result: passed; exit code: not recorded; evidence: [ev-session-verify].
The archive helper did not execute these commands; results above are taken from the cited evidence.

## Review
Reported status: approved; evidence: [ev-session-review].

## Deviations from plan
- Change: Early start error uses show() with exit(1) on dismissal instead of blocking_show()
  Reason: blocking_show must not run on the main thread during setup
  Effect: The dialog shows and the app exits with code 1 after OK
  Evidence: [ev-session-review], [ev-session-verify].
- Change: Unknown /api paths answer 404 without session and Host checks
  Reason: Checks key on the matched route; no route means no checks
  Effect: Previously 401; no data is exposed
  Evidence: [ev-session-review].
- Change: An approval repeat after the grant switched to allow consumes the pending id without a second limit unit
  Reason: not recorded
  Effect: Approval quota is preserved across grant mode changes (91c095f)
  Evidence: [ev-session-review].
- Change: Header error text names Latin-1 and the range is escaped as \u00ff
  Reason: The previous text said only control characters
  Effect: Clearer INVALID_INPUT message (5313c67)
  Evidence: [ev-session-review].

## Consciously excluded scope
- Space titles still accept C0 controls \u0000-\u001f; the spec covers only hidden-text classes. (evidence: [ev-session-review])

## Confirmed follow-ups
Not recorded.

## Limitations and unresolved risks
- Orca does not hide a tab on switch, so the modal reload check dispatched visibilitychange by script. (evidence: [ev-session-verify])

## Evidence register
- [ev-session-verify] session: Claude Code session 0b36365d-4e7b-42e2-b09b-91be1298a885 (2026-10-27), Bash tool results: pnpm typecheck; pnpm test (worktree audit-fixes-execution and later main); SDK build and API build:bundle/smoke:bundle; live API curl probes on 127.0.0.1:3021; Orca browser checks; cargo check/test; pnpm -C apps/desktop run package; built-app kill -9 and early-error runs
  At 5313c67/1edb493: pnpm typecheck passed; pnpm test passed (contracts 609, widget-sdk 388, ui 722, api 404, create-widget 51, examples 136). SDK cli.js and API dist-bundle inline undici; smoke:bundle OK. Live branch API: /%61pi/v1/spaces 401, encoded POST with foreign Host 403, encoded sandbox path with foreign Host 403, /%2561pi and //api served SPA HTML without data. Orca two-tab conflict: Done kept edit mode, rows 14 and the notice; second Done repeated it; Cancel loaded 24x13 from the other tab. Package widget modal stayed open after a visibilitychange-triggered board reload and showed Third-party widget · dev.lifedashboard.showcase.counter. cargo check passed without warnings; cargo test 5 passed; desktop package built .app and dmg; after kill -9 of the app the node sidecar exited within 0.5 s and port 3101 was free; with the data folder replaced by a file the owner saw the dialog LifeDashboard could not start / Not a directory (os error 20) and the app exited with code 1.
  Inspected by caller: true; helper validation: agent-attested-session.
  Capture: reference-only; summary preserved, original body not captured.
- [ev-session-review] session: Claude Code session 0b36365d-4e7b-42e2-b09b-91be1298a885 (2026-10-27), Bash tool results: git diff 725bcd5..bf44916 read in full against the plan; commit 5313c67
  Re-check of the 18 executing-agent commits against plan and spec. No attribution trailers; undici 8.11.2 is the only new dependency. One finding fixed by RED/GREEN in 5313c67 (header error text names Latin-1; range escaped as \u00ff). Accepted deviations: early-error dialog uses show() with exit(1) instead of blocking_show() on the main thread; unknown /api paths answer 404 without session/Host checks; the decline route writes no DECLINED audit row; an approval repeat after a switch to allow spends no second unit (91c095f); confirmations.ts imports ./toasts.js for NodeNext (01fda3f). The executing agent recorded a final whole-branch review fixed in bf44916; its report was not inspected.
  Inspected by caller: true; helper validation: agent-attested-session.
  Capture: reference-only; summary preserved, original body not captured.

## Source assessment
Spec and plan dated 2026-10-27, approved by the owner in session 0b36365d; the plan links the spec by path. Both were committed (725bcd5 and earlier), executed on fix/audit-findings, fast-forwarded into main, and removed from docs/superpowers by 1edb493; the archive reads them from 5313c67, where they are byte-identical to the approved versions. Implementation commits 8a07e21..5313c67 are in main at 1edb493. Evidence is the session verification and review recorded here.
Evidence: [ev-session-verify], [ev-session-review].

## Archive notes
- URL/session evidence is agent-attested; the helper does not fetch or independently verify it.

This is historical evidence, not living project documentation. Sources were copied, not rewritten.
