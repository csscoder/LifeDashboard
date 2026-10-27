# Widget modal applications — frozen outcome

Feature ID: widget-modals
Status: incomplete-evidence
Completed at: not recorded
Archived at: 2026-10-27T16:59:29Z
Skill: archive-plan 1.1.1
Archive revision: 2

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
HEAD commit: 9dbda55da9b00f72a8050ad9b08f34bd8160efcc
Describe: 9dbda55
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
- Command/check: Owner manual check on the installed showcase-counter: typing, Tab, Escape inside the iframe, Save progress then close shows the saved count
  Result: passed; exit code: not recorded; evidence: [ev-owner-check].
- Command/check: Escape consumed by an in-modal control does not close the modal (no such control in the example)
  Result: not-run; exit code: not recorded; evidence: [ev-owner-check].
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
- Check live that Escape consumed by an in-modal control (an open menu or listbox) does not close the modal, with a widget that has such a control. (evidence: [ev-owner-check])

## Limitations and unresolved risks
- Only the consumed-Escape case remains unverified live; the example has no control that consumes Escape. (evidence: [ev-owner-check])

## Evidence register
- [ev-plan] session: Claude Code session 0b36365d-4e7b-42e2-b09b-91be1298a885 (2026-10-27), Bash tool results: sed of docs/superpowers/plans/2026-10-23-widget-modals.md (lines 286-342) at 1edb493, before the source was removed in a6f39a3
  Tasks 1-8 implemented with RED/GREEN (recorded process deviations in Task 6); workspace tests 2168 passed, typecheck, SDK build and example build/check passed. Live Orca evidence covers persistence and remount, two instances, busy slot, nested rejection, error/retry, pending-write drain, source change/removal, confirmation stacking, themes and 1280x420. Final review Approved. Native opaque-iframe input/Escape/Tab and the uninstrumented installed-example save flow remain unverified; both live checkboxes are unchecked.
  Inspected by caller: true; helper validation: agent-attested-session.
  Capture: reference-only; summary preserved, original body not captured.
- [ev-head] session: Claude Code session 0b36365d-4e7b-42e2-b09b-91be1298a885 (2026-10-27), Bash tool results: ls apps/ui/app/widgets/WidgetModal.vue packages/widget-sdk/src/modal-host.ts examples/widgets/showcase-counter/src/CounterWorkspace.vue; git grep SDK_TARGET_LEVEL
  Modal host, dashboard modal and the counter workspace example exist at HEAD 1edb493; SDK_TARGET_LEVEL is 4; the work landed in 9562ed3.
  Inspected by caller: true; helper validation: agent-attested-session.
  Capture: reference-only; summary preserved, original body not captured.
- [ev-owner-check] session: Claude Code session 0b36365d-4e7b-42e2-b09b-91be1298a885 (2026-10-27): owner message after the seven-step manual checklist ("все работает")
  The owner ran the manual checklist on the installed showcase-counter in the dashboard: typing a number into the modal field, Tab between the modal controls, Escape inside the iframe closing the modal, and Save progress then close showing the saved count on the board. The owner reported that everything works. The step "Escape consumed by an in-modal control does not close" does not apply to this example: CounterWorkspace.vue has only a number input and two buttons. During the check the owner found that clicking text in the widget settings panel closed it; that was a separate bug in WidgetSettings.vue, fixed in 9dbda55.
  Inspected by caller: true; helper validation: agent-attested-session.
  Capture: reference-only; summary preserved, original body not captured.

## Source assessment
Revision of the 2026-10-27 widget-modals archive. Sources are read from 1edb493, where they are byte-identical to the archived revision 1 copies; they were removed from docs/superpowers in a6f39a3. New evidence: the owner manual checklist in this session covers native typing, Tab, Escape inside the iframe and the installed-example save flow. The consumed-Escape case is not exercised by the example and remains unverified.
Evidence: [ev-plan], [ev-head], [ev-owner-check].

## Archive notes
- Explicit incomplete-evidence archive. Unsupported gates: verification, verification checks.
- Completion date not recorded; completedAt remains null.
- URL/session evidence is agent-attested; the helper does not fetch or independently verify it.
Incomplete-evidence authorization/reason: Owner requested a widget-modals revision on 2026-10-27 after passing the manual checklist; incomplete-evidence stays approved because the consumed-Escape live check does not apply to the example
Previous frozen archive: 2026-10-27-widget-modals
Revision reason: Owner requested a widget-modals revision on 2026-10-27 after passing the manual checklist; incomplete-evidence stays approved because the consumed-Escape live check does not apply to the example

This is historical evidence, not living project documentation. Sources were copied, not rewritten.
