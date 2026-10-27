# Dashboard controls — frozen outcome

Feature ID: dashboard-controls
Status: completed
Completed at: not recorded
Archived at: 2026-10-27T15:43:32Z
Skill: archive-plan 1.1.1
Archive revision: 1

## Implemented scope and outcomes
- Quiet header, bottom screen navigation and a bottom-right settings popover holding the add-widget picker, Edit board, Widget library, themes, API status and grid size (9562ed3). (evidence: [ev-plan], [ev-head])
- Follow-ups: 25% idle opacity for controls, compact space switcher, settings panel scaled to 70%. (evidence: [ev-plan])

## Accepted decisions
- A native automatic popover handles dismissal and keyboard behavior instead of a settings page or custom drawer. (evidence: [ev-plan])

## Archived source map
Original links inside preserved documents are unchanged; linked external documents are not bundled.
- `docs/superpowers/specs/2026-10-23-dashboard-controls-design.md` → [spec](spec.md)
- `docs/superpowers/plans/2026-10-23-dashboard-controls.md` → [plan](plan.md)

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
Reported status: passed.
- Command/check: pnpm -C apps/ui typecheck
  Result: passed; exit code: not recorded; evidence: [ev-plan].
- Command/check: pnpm test
  Result: passed; exit code: not recorded; evidence: [ev-plan].
- Command/check: Orca checks of the settings panel, editing, switching, themes and notices at three viewports
  Result: passed; exit code: not recorded; evidence: [ev-plan].
The archive helper did not execute these commands; results above are taken from the cited evidence.

## Review
Reported status: approved; evidence: [ev-plan].

## Deviations from plan
Deviations: not recorded / unverified. No absence claim is made.

## Consciously excluded scope
Not recorded.

## Confirmed follow-ups
- Deferred minor: the Done button primary color rule loses to the base rule of equal specificity. (evidence: [ev-plan])

## Limitations and unresolved risks
- Not checked: packaged Tauri build, a real API outage, destructive deletion of existing data; the final live hover-width measurement of the compact switcher was not completed. (evidence: [ev-plan])

## Evidence register
- [ev-plan] file: docs/superpowers/plans/2026-10-23-dashboard-controls.md
  Verification results: panel tests RED 8 then GREEN; keyboard regression RED/GREEN; UI typecheck passed; pnpm test 1839 passed; Orca checks at 1697x944, 1280x720 and 1280x480 for dismissal, placement, editing, switching, themes, long titles and failure visibility. Independent review: no Critical; Important keyboard-bubbling finding fixed; one deferred minor Done button style. Follow-ups: quiet controls opacity, compact space switcher, 70% settings panel, each verified.
  Inspected by caller: true; helper validation: bytes-hashed.
  Capture: reference-only; summary preserved, original body not captured.
  SHA-256: 88bd31984471f11409a1c3bf98b303b88c93dd32cb7dda4a6492cd67645ade70
- [ev-head] session: Claude Code session 0b36365d-4e7b-42e2-b09b-91be1298a885 (2026-10-27), Bash tool results: ls apps/ui/app/SettingsPanel.vue; git log 9562ed3
  SettingsPanel.vue exists at HEAD 1edb493; the work landed in 9562ed3 (2026-10-24).
  Inspected by caller: true; helper validation: agent-attested-session.
  Capture: reference-only; summary preserved, original body not captured.

## Source assessment
The spec status says approved, implemented and verified, and points to this plan; the plan links the spec. Implementation is in tree (9562ed3). The plan records test, Orca and review results.
Evidence: [ev-plan], [ev-head].

## Archive notes
- Completion date not recorded; completedAt remains null.
- Deviations from plan were not recorded; absence of deviations is not claimed.
- URL/session evidence is agent-attested; the helper does not fetch or independently verify it.

This is historical evidence, not living project documentation. Sources were copied, not rewritten.
