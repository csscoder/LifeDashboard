# Widget modal applications — frozen outcome

Feature ID: widget-modals
Status: incomplete-evidence
Completed at: not recorded
Archived at: 2026-10-27T15:43:36Z
Skill: archive-plan 1.1.1
Archive revision: 1

## Implemented scope and outcomes
- Installed widgets open named Vue modal screens in a second sandbox sharing the widget identity, state and permissions; every close remounts the caller; SDK level 4; counter example with a modal editor (9562ed3). (evidence: [ev-plan], [ev-head])

## Accepted decisions
- A second sandbox with a separate Vue application, not an expanded single sandbox; no shared reactive store. (evidence: [ev-plan])
- Every completed close restarts the caller after known requests settle; local caller memory may reset, API data and widget.state survive. (evidence: [ev-plan])

## Archived source map
Original links inside preserved documents are unchanged; linked external documents are not bundled.
- `docs/superpowers/specs/2026-10-23-widget-modals-design.md` → [spec](spec.md)
- `docs/superpowers/plans/2026-10-23-widget-modals.md` → [plan](plan.md)

## Areas and modules
Not recorded.

## Git state
Repository root: .
Branch: main
HEAD commit: 1edb493213662a0fb3e94a3113b4287401302087
Describe: 1edb493
Working tree: clean

## Implementation evidence
Reported status: completed; evidence: [ev-head], [ev-plan].

## Verification
Reported status: unverified.
- Command/check: pnpm typecheck && pnpm test
  Result: passed; exit code: not recorded; evidence: [ev-plan].
- Command/check: pnpm -C packages/widget-sdk build; showcase-counter test/typecheck/check/build
  Result: passed; exit code: not recorded; evidence: [ev-plan].
- Command/check: Orca live matrix with an instrumented package: remount, busy slot, error/retry, drain, source change, confirmations, themes, short viewport
  Result: passed; exit code: not recorded; evidence: [ev-plan].
- Command/check: Orca native input, Escape and Tab inside the opaque iframe and the uninstrumented installed-example save flow
  Result: unverified; exit code: not recorded; evidence: [ev-plan].
The archive helper did not execute these commands; results above are taken from the cited evidence.

## Review
Reported status: approved; evidence: [ev-plan].

## Deviations from plan
- Change: Task 6 tests were first added after implementation, then deleted and redone with genuine RED
  Reason: Controller required TDD order
  Effect: not recorded
  Evidence: [ev-plan].

## Consciously excluded scope
Not recorded.

## Confirmed follow-ups
- Check by hand: typing into the modal, Escape inside the iframe, Escape consumed by an in-modal control, Tab order, and the edit-save-close flow of the installed counter example. (evidence: [ev-plan])

## Limitations and unresolved risks
- Native opaque-iframe input/Escape/Tab and the uninstrumented installed-example save flow are unverified because Orca does not deliver native input into the iframe. (evidence: [ev-plan])

## Evidence register
- [ev-plan] file: docs/superpowers/plans/2026-10-23-widget-modals.md
  Tasks 1-8 implemented with RED/GREEN (recorded process deviations in Task 6); workspace tests 2168 passed, typecheck, SDK build and example build/check passed. Live Orca evidence covers persistence and remount, two instances, busy slot, nested rejection, error/retry, pending-write drain, source change/removal, confirmation stacking, themes and 1280x420. Final review Approved. Native opaque-iframe input/Escape/Tab and the uninstrumented installed-example save flow remain unverified; both live checkboxes are unchecked.
  Inspected by caller: true; helper validation: bytes-hashed.
  Capture: reference-only; summary preserved, original body not captured.
  SHA-256: a2c854d2d62803015b71356aebc1b4388cdcc97d6455ec0ed9140fc94a5663fe
- [ev-head] session: Claude Code session 0b36365d-4e7b-42e2-b09b-91be1298a885 (2026-10-27), Bash tool results: ls apps/ui/app/widgets/WidgetModal.vue packages/widget-sdk/src/modal-host.ts examples/widgets/showcase-counter/src/CounterWorkspace.vue; git grep SDK_TARGET_LEVEL
  Modal host, dashboard modal and the counter workspace example exist at HEAD 1edb493; SDK_TARGET_LEVEL is 4; the work landed in 9562ed3.
  Inspected by caller: true; helper validation: agent-attested-session.
  Capture: reference-only; summary preserved, original body not captured.

## Source assessment
The spec is owner-approved (2026-10-23) after a prototype review; the plan links it. Implementation is in tree (9562ed3). Automated checks, reviews and most live checks are recorded in the plan; native iframe input and the final uninstrumented save remain unverified.
Evidence: [ev-plan], [ev-head].

## Archive notes
- Explicit incomplete-evidence archive. Unsupported gates: verification, verification checks.
- Completion date not recorded; completedAt remains null.
- URL/session evidence is agent-attested; the helper does not fetch or independently verify it.
Incomplete-evidence authorization/reason: Owner approved archiving on 2026-10-27 with the final live checks recorded as unverified in the plan

This is historical evidence, not living project documentation. Sources were copied, not rewritten.
