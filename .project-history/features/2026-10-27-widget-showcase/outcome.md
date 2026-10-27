# Widget showcase — frozen outcome

Feature ID: widget-showcase
Status: completed
Completed at: not recorded
Archived at: 2026-10-27T15:43:31Z
Skill: archive-plan 1.1.1
Archive revision: 1

## Implemented scope and outcomes
- Three installable SDK examples: frameless analog clock, focus-session counter with persisted state and conflict handling, live Open-Meteo weather through the gateway (251735e). (evidence: [ev-report], [ev-head])
- README gallery with real dashboard captures, source links and weather attribution. (evidence: [ev-report])

## Accepted decisions
- Weather uses real Open-Meteo data through the SDK gateway with no API key and no fabricated fallback; provider attribution and free endpoint policy are documented. (evidence: [ev-report])

## Archived source map
Original links inside preserved documents are unchanged; linked external documents are not bundled.
- `docs/superpowers/specs/2026-10-22-widget-showcase.md` → [spec](spec.md)
- `docs/superpowers/plans/2026-10-22-widget-showcase.md` → [plan](plan.md)

## Areas and modules
Not recorded.

## Git state
Repository root: .
Branch: main
HEAD commit: 1edb493213662a0fb3e94a3113b4287401302087
Describe: 1edb493
Working tree: clean

## Implementation evidence
Reported status: completed; evidence: [ev-head], [ev-report].

## Verification
Reported status: passed.
- Command/check: pnpm test
  Result: passed; exit code: not recorded; evidence: [ev-report].
- Command/check: pnpm typecheck && pnpm build
  Result: passed; exit code: not recorded; evidence: [ev-report].
- Command/check: pnpm --filter '@lifedashboard/example-showcase-*' check
  Result: passed; exit code: not recorded; evidence: [ev-report].
- Command/check: Orca: import built folders into an isolated dataset, render, counter read-back, live weather, sizes and themes
  Result: passed; exit code: not recorded; evidence: [ev-report].
The archive helper did not execute these commands; results above are taken from the cited evidence.

## Review
Reported status: approved; evidence: [ev-report].

## Deviations from plan
Deviations: not recorded / unverified. No absence claim is made.

## Consciously excluded scope
Not recorded.

## Confirmed follow-ups
Not recorded.

## Limitations and unresolved risks
- Native pointer/keyboard input inside the opaque widget iframe was not verified; counter interaction used the real controller and gateway. (evidence: [ev-report])

## Evidence register
- [ev-plan] file: docs/superpowers/plans/2026-10-22-widget-showcase.md
  Five-step implementation record linking the spec and the verification report.
  Inspected by caller: true; helper validation: bytes-hashed.
  Capture: reference-only; summary preserved, original body not captured.
  SHA-256: 16d4d933321c50f6bcfd7362c0b9f4fa956da420b91c72afad629e077cca0e8d
- [ev-report] file: docs/superpowers/reports/2026-10-22-widget-showcase.md
  Verification report 2026-10-22: pnpm test 1828 passed incl. 98 showcase tests; typecheck and build passed; all three showcase checks passed; built folders imported into an isolated dataset and rendered; counter value 5 read back after reload via controller/gateway; Open-Meteo returned HTTP 200 through the gateway; sizes checked in Paper and Glass; review fixes listed; final independent review found no Important/Critical issue. Limits: native mouse/key inside the opaque iframe unverified.
  Inspected by caller: true; helper validation: bytes-hashed.
  Capture: reference-only; summary preserved, original body not captured.
  SHA-256: bcb6dc354617c4df41a4be737c7a5d22fc1ac677f008e5c42503d876f559d345
- [ev-head] session: Claude Code session 0b36365d-4e7b-42e2-b09b-91be1298a885 (2026-10-27), Bash tool results: ls examples/widgets/showcase-{clock,counter,weather}; git log 251735e
  The three showcase example folders exist at HEAD 1edb493; they were added in 251735e (2026-10-22).
  Inspected by caller: true; helper validation: agent-attested-session.
  Capture: reference-only; summary preserved, original body not captured.

## Source assessment
The spec records the owner-approved clock/counter/weather scope; the plan links it and the verification report. No draft or superseded marker. Implementation is in tree (251735e). The committed report records test, build, live dashboard and review results.
Evidence: [ev-plan], [ev-report], [ev-head].

## Archive notes
- Completion date not recorded; completedAt remains null.
- Deviations from plan were not recorded; absence of deviations is not claimed.
- URL/session evidence is agent-attested; the helper does not fetch or independently verify it.

This is historical evidence, not living project documentation. Sources were copied, not rewritten.
