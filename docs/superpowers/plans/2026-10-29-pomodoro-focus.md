# Pomodoro Focus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A built-in Pomodoro widget on top of a dashboard-wide focus engine: timer, task label and projects, per-day history, system notifications, a notification hold for other widgets and `context.focus` for every widget.

**Architecture:** Contracts define the focus types and parsers. The API stores settings, the current run, projects and sessions in SQLite. A pure engine in `apps/ui/app/focus/engine.ts` computes every transition; a singleton store drives it with one timer, a serialized write chain and widget presence. The widget, its task picker, statistics dialog and settings editor are trusted built-in Vue code that use the store directly.

**Tech Stack:** TypeScript (strict), Vue 3 / Nuxt 4, reka-ui 2.11, Fastify + `node:sqlite`, Vitest 5, Tauri 2.12 + `tauri-plugin-notification` 2.7.0.

**Spec:** `docs/superpowers/specs/2026-10-29-pomodoro-focus-design.md`

## Global Constraints

- Branch `feat/pomodoro-focus`. The user's uncommitted `apps/ui/app/board/WidgetBoard.vue` is not part of this work: never stage, edit or revert it. Stage named files only.
- TDD: each behaviour change starts with a failing test that is run and seen failing.
- UI copy is English. Widget title `Pomodoro`, type `pomodoro`.
- Settings defaults and bounds: focus 25 (1–120) min, short break 5 (1–60), long break 15 (1–60), long break every 4 (2–12), daily goal 8 (1–24), `autoStartBreak: true`, `autoStartFocus: false`, `sound: true`.
- Durations in `FocusRun` are milliseconds: minutes × 60 000.
- Label ≤ 120 characters; project name 1–40 characters; project colour is a `SpaceColor`; session range ≤ 366 days.
- A skipped or reset focus is recorded only with at least 60 000 ms of focus.
- `context.focus` exposes only `{ phase: 'none' | 'focus' | 'break'; running: boolean; endsAt: number | null }`; never the label, project or history. No gateway operation writes focus state.
- New dependencies are exactly `tauri-plugin-notification = "=2.7.0"` (Cargo) and `"@tauri-apps/plugin-notification": "2.7.0"` (apps/ui). No other new dependency.
- Phase-end notification texts: `Focus done — {n} min break`, `Focus done — {n} min long break`, `Break over — time to focus`.
- Toast hold: queue ≤ 50 (oldest dropped); flush shows ≤ 5 toasts then `+{n} notifications while you focused`.
- Commit messages: the project's `type(scope): subject` format, one short line, no attribution trailers.
- Rust lives in `~/.cargo/bin`; prefix desktop commands with `PATH="$HOME/.cargo/bin:$PATH"`.
- Browser checks use Orca's built-in browser through `orca` CLI.

## Review Focus

1. A phase deadline passes while the window is in the background and the user then presses pause/skip/reset: the phase must be completed once at `endsAt`, never recorded as interrupted (Task 3 test `action after deadline completes the phase once`).
2. The API is down for a while during a completed pomodoro: the session must survive retries and a 409 and be stored exactly once (Task 4 tests `session survives failure and conflict`, Task 2 test `repeated session id is ignored`).
3. The user opens another screen mid-focus and comes back: pause on 0 widgets, resume on return; a manual pause is never auto-resumed (Task 4 test `presence pauses and resumes only hidden pauses`).
4. The user edits durations while a focus runs: the running phase keeps its length, the next phase uses the new one (Task 3 test `settings change applies to the next phase`).
5. Day boundary: a pomodoro finished at 00:05 counts toward the new day's goal (Task 3 test `dayKey uses local date of endedAt`, Task 11 test `today uses local day keys`).

---

### Task 1: Focus contracts

**Files:**
- Create: `packages/contracts/src/focus.ts`
- Modify: `packages/contracts/src/space.ts` (export `isSpaceColor` if it is not exported)
- Test: `packages/contracts/test/focus.test.ts`

**Interfaces:**
- Produces (all exported from `@lifedashboard/contracts/focus`):
  - `interface FocusSettings`, `type FocusPhase = 'focus' | 'short' | 'long'`, `interface FocusRun`, `interface FocusSessionInput`, `interface FocusSession extends FocusSessionInput {}`, `interface FocusProject` — fields exactly as in the spec «Contracts».
  - `FOCUS_LIMITS = { focusMin: [1, 120], shortBreakMin: [1, 60], longBreakMin: [1, 60], longBreakEvery: [2, 12], dailyGoal: [1, 24], label: 120, projectName: 40, rangeDays: 366, minRecordedMs: 60_000 } as const`
  - `DEFAULT_FOCUS_SETTINGS: FocusSettings`
  - `initialRun(settings: FocusSettings): FocusRun`
  - `interface FocusState { settings: FocusSettings; run: FocusRun; revision: number; projects: FocusProject[]; recentLabels: string[] }`
  - `interface FocusPutRequest { settings?: FocusSettings; run: FocusRun; session?: FocusSessionInput; expectedRevision: number }`
  - `parseFocusSettings(raw: unknown): ParseResult<FocusSettings>`
  - `parseFocusRun(raw: unknown): ParseResult<FocusRun>`
  - `parseFocusSession(raw: unknown): ParseResult<FocusSessionInput>`
  - `parseFocusPut(raw: unknown): ParseResult<FocusPutRequest>`
  - `parseProjectCreate(raw: unknown): ParseResult<{ name: string; color: SpaceColor }>`
  - `parseProjectPatch(raw: unknown): ParseResult<{ name?: string; color?: SpaceColor; archived?: boolean }>`
  - `parseSessionRange(from: unknown, to: unknown): ParseResult<{ from: string; to: string }>`

- [ ] **Step 1: Write the failing tests** in `packages/contracts/test/focus.test.ts`:
  - `initialRun uses milliseconds`: `initialRun(DEFAULT_FOCUS_SETTINGS)` equals `{ phase: 'focus', status: 'ready', durationMs: 1_500_000, endsAt: null, remainingMs: 1_500_000, resumedAt: null, pausedBy: null, phaseStartedAt: null, focusedMs: 0, streak: 0, label: null, projectId: null, seenAt: null }`.
  - `settings bounds`: `parseFocusSettings({ ...DEFAULT_FOCUS_SETTINGS, focusMin: 121 }).ok === false`; `focusMin: 0`, `longBreakEvery: 1`, `dailyGoal: 25`, non-integer `focusMin: 2.5`, unknown key `extra: 1` all fail; defaults pass.
  - `run validation`: a valid running run passes; `status: 'running'` with `endsAt: null` fails; `phase: 'idle'` fails; `label` of 121 characters fails; negative `remainingMs` fails.
  - `session validation`: `day: '2026-13-01'` fails; negative or non-integer `focusMs`/`plannedMs` fail; `endedAt` before `startedAt` fails; non-ISO `startedAt` fails; `label` of 121 characters fails.
  - `put request`: missing `expectedRevision` fails; `session` optional; unknown key fails.
  - `project parsers`: name trimmed; `''` and 41 characters fail; colour `'black'` fails; patch `{}` fails with `nothing to change`.
  - `session range`: `('2026-01-01', '2027-01-02')` (367 days) fails; `('2026-10-29', '2026-10-01')` fails; `('2026-01-01', '2027-01-01')` passes.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -C packages/contracts exec vitest run test/focus.test.ts`
Expected: FAIL, cannot resolve `../src/focus.ts`.

- [ ] **Step 3: Implement `packages/contracts/src/focus.ts`**

Follow `parseSpacePatch` style (`isRecord`, `unknownKey`, `fail`, `HIDDEN_TEXT` from `./parse.ts`; `isSpaceColor` and `SpaceColor` from `./space.ts` — export `isSpaceColor` there if it is not exported). Labels and names reject control and hidden characters like space titles.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -C packages/contracts exec vitest run test/focus.test.ts && pnpm -C packages/contracts typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/focus.ts packages/contracts/test/focus.test.ts packages/contracts/src/space.ts
git commit -m "feat(contracts): focus settings, run, session and project contracts"
```

---

### Task 2: Focus API and storage

**Files:**
- Modify: `apps/api/src/migrations.ts` (append one SQL migration with the three tables and index from the spec)
- Create: `apps/api/src/focus.ts`
- Modify: `apps/api/src/app.ts` (call `registerFocus(app, { db, now })`)
- Test: `apps/api/test/focus.test.ts` (use `testApp`, `pair`, `call` from `./helpers.ts` as `spaces.test.ts` does)

**Interfaces:**
- Consumes: Task 1 parsers, `DEFAULT_FOCUS_SETTINGS`, `initialRun`, `FocusState`.
- Produces: `registerFocus(app: FastifyInstance, deps: { db: DatabaseSync; now: () => Date }): void` and the routes:
  - `GET /api/v1/focus` → `FocusState`
  - `PUT /api/v1/focus` (`FocusPutRequest`) → `{ revision: number }`
  - `GET /api/v1/focus/sessions?from&to` → `FocusSession[]`
  - `POST /api/v1/focus/projects` → `FocusProject`
  - `PATCH /api/v1/focus/projects/:id` → `FocusProject`

- [ ] **Step 1: Write the failing tests**:
  - `first read creates defaults`: GET returns `settings` equal to `DEFAULT_FOCUS_SETTINGS`, `run` equal to `initialRun(DEFAULT_FOCUS_SETTINGS)`, `revision: 1`, `projects: []`, `recentLabels: []`.
  - `put stores run and session in one write`: PUT with `expectedRevision: 1` and a session returns `{ revision: 2 }`; GET shows the new run; GET sessions for that `day` returns the session.
  - `stale revision is 409`: a second PUT with `expectedRevision: 1` → 409 with code `REVISION_CONFLICT`, run unchanged.
  - `repeated session id is ignored`: two successful PUTs carrying the same session `id` leave one row.
  - `unknown project is 400`: run with `projectId` that does not exist → 400.
  - `invalid body is 400`: `focusMin: 0` in `settings` → 400.
  - `range limit`: `from=2026-01-01&to=2027-01-02` → 400; a 30-day range returns sessions ordered by `ended_at`.
  - `recentLabels`: 12 sessions with labels `l1`…`l12` (some repeated) → 10 most recent distinct non-empty labels, newest first.
  - `projects`: POST `{ name: ' Work ', color: 'blue' }` returns `name: 'Work'`, `archivedAt: null`; PATCH `{ archived: true }` sets `archivedAt`; PATCH unknown id → 404; archived projects still appear in GET `projects` with `archivedAt` set.
  - `requires a session`: GET without the pairing cookie → 401.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -C apps/api exec vitest run test/focus.test.ts`
Expected: FAIL, routes return 404.

- [ ] **Step 3: Implement** the migration and `apps/api/src/focus.ts`

Route style follows `registerSpaces` (`ok(request, data)`, `ApiError`). Revision conflict throws `ApiError('REVISION_CONFLICT', …)` like board saves (status 409; the spec's «409 `CONFLICT`» means this status, and the UI maps every non-confirmation 409 to `conflict`). PUT runs in one transaction: check revision, validate `projectId` existence, `INSERT OR IGNORE` the session, update `settings` (when present), `run`, `revision + 1`, `updated_at`. Store `completed` as 0/1 and map rows to camelCase.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -C apps/api exec vitest run test/focus.test.ts test/db.test.ts && pnpm -C apps/api typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/migrations.ts apps/api/src/focus.ts apps/api/src/app.ts apps/api/test/focus.test.ts
git commit -m "feat(api): focus settings, run, sessions and projects storage"
```

---

### Task 3: Focus engine

**Files:**
- Create: `apps/ui/app/focus/engine.ts`
- Test: `apps/ui/test/focus-engine.test.ts`

**Interfaces:**
- Consumes: Task 1 types, `FOCUS_LIMITS.minRecordedMs`.
- Produces (pure, no timers, no I/O; `now` is epoch ms):
  - `type Step = { run: FocusRun; session?: FocusSessionInput }`
  - `start(settings: FocusSettings, run: FocusRun, now: number, newId: () => string): Step`
  - `pause(settings, run, now, by: 'user' | 'hidden', newId): Step`
  - `resume(settings, run, now, newId): Step`
  - `skip(settings, run, now, newId): Step`
  - `reset(settings, run, now, newId): Step`
  - `advance(settings, run, now, newId): Step`
  - `restore(settings, run, newId): Step`
  - `dayKey(epochMs: number): string`
  - `publicStatus(run: FocusRun): { phase: 'none' | 'focus' | 'break'; running: boolean; endsAt: number | null }`

Every action on a running run first applies `advance` (deadline first). `newId` makes session ids (the store passes `crypto.randomUUID`). Transition rules are exactly the spec «engine.ts» list; `publicStatus` follows the spec «Widget contract» mapping.

- [ ] **Step 1: Write the failing tests** (fixed settings `S = DEFAULT_FOCUS_SETTINGS`, `T0 = Date.UTC(2026, 9, 29, 9)`, `id = () => 'id'`):
  - `start sets running fields`: from `initialRun(S)`, `start(S, run, T0)` gives `endsAt: T0 + 1_500_000`, `resumedAt: T0`, `seenAt: T0`, `phaseStartedAt: new Date(T0).toISOString()`.
  - `completed focus goes to short break`: `advance` at `T0 + 1_500_000` returns a session `{ completed: true, plannedMs: 1_500_000, focusMs: 1_500_000, startedAt: iso(T0), endedAt: iso(T0 + 1_500_000), day: dayKey(T0 + 1_500_000) }`, run `phase: 'short'`, `status: 'running'` (autoStartBreak), `durationMs: 300_000`, `streak: 1`.
  - `fourth pomodoro gives long break and resets streak`: run with `streak: 3` completes → `phase: 'long'`, `durationMs: 900_000`, `streak: 0`.
  - `break end respects autoStartFocus`: short break completes → `phase: 'focus'`, `status: 'ready'`; with `autoStartFocus: true` → `running` with `phaseStartedAt` set.
  - `auto-started focus records startedAt`: break → auto focus → completed session has `startedAt` equal to the auto-start time.
  - `pause and resume accumulate focus`: start T0, pause T0+600_000, resume T0+700_000, complete at its new `endsAt` → `focusMs: 1_500_000`, `endedAt` = T0 + 1_600_000.
  - `skip records only after a minute`: skip at T0+59_999 → no session, next phase `short`, `status: 'ready'`, `streak` unchanged; skip at T0+60_000 → session `completed: false`, `focusMs: 60_000`.
  - `reset returns to full duration`: reset at T0+120_000 → session `completed: false`, run `focus`/`ready`, `remainingMs: durationMs`, `focusedMs: 0`, `phaseStartedAt: null`.
  - `action after deadline completes the phase once`: pause, skip and reset called at `endsAt + 5_000` each return a session with `completed: true` and `endedAt = iso(endsAt)`, never a second session.
  - `settings change applies to the next phase`: running focus started with 25 min; `advance` with settings `focusMin: 50, shortBreakMin: 10` at the old `endsAt` completes with `plannedMs: 1_500_000` and the break has `durationMs: 600_000`.
  - `restore counts up to the heartbeat`: running run with `resumedAt: T0`, `seenAt: T0 + 600_000`, `focusedMs: 0` → `paused`, `pausedBy: 'user'`, `remainingMs: 900_000`, `focusedMs: 600_000`; then resume at T1 and skip at T1 + 120_000 → session `focusMs: 720_000`.
  - `restore right after start`: `seenAt === resumedAt` → `focusedMs` unchanged, `remainingMs` = `endsAt − seenAt`, never negative.
  - `restore after the deadline`: `seenAt >= endsAt` → phase completed at `endsAt`.
  - `dayKey uses local date of endedAt`: with `TZ` set to `Europe/Berlin` in the test (`process.env.TZ`), 2026-10-29T23:05:00Z → `'2026-10-30'`.
  - `publicStatus mapping`: focus/ready → `none`; focus/running → `focus`, `running: true`, `endsAt` set; focus/paused → `focus`, `running: false`, `endsAt: null`; short/ready → `break`.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -C apps/ui exec vitest run test/focus-engine.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `apps/ui/app/focus/engine.ts`** per the spec rules. A private `begin(phase, settings, autoStart, now)` builds the next phase and applies `start` when `autoStart`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -C apps/ui exec vitest run test/focus-engine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/app/focus/engine.ts apps/ui/test/focus-engine.test.ts
git commit -m "feat(ui): pure pomodoro focus engine"
```

---

### Task 4: Focus store, API client and presence

**Files:**
- Modify: `apps/ui/app/api.ts` (add `focus`, `saveFocus`, `focusSessions`, `createFocusProject`, `updateFocusProject` to `api`)
- Create: `apps/ui/app/focus/store.ts`
- Test: `apps/ui/test/focus-store.test.ts`

**Interfaces:**
- Consumes: Task 3 engine, Task 1 types, `api`.
- Produces:
  - `api.focus(): Promise<ApiResult<FocusState>>`, `api.saveFocus(body: FocusPutRequest): Promise<ApiResult<{ revision: number }>>`, `api.focusSessions(from: string, to: string): Promise<ApiResult<FocusSession[]>>`, `api.createFocusProject(body: { name: string; color: SpaceColor }): Promise<ApiResult<FocusProject>>`, `api.updateFocusProject(id: string, patch: { name?: string; color?: SpaceColor; archived?: boolean }): Promise<ApiResult<FocusProject>>`
  - `createFocusStore(deps: { api: Pick<typeof api, 'focus' | 'saveFocus' | 'focusSessions' | 'createFocusProject' | 'updateFocusProject'>; now: () => number; newId: () => string; onPhaseEnd(event: { from: FocusPhase; to: FocusPhase; nextMinutes: number }): void; onSaveFailed(): void; onConflict(): void })` returning `FocusStore`
  - `interface FocusStore { state: { loaded: boolean; loadError: boolean; settings: FocusSettings; run: FocusRun; projects: FocusProject[]; recentLabels: string[]; todayCount: number }; status: ComputedRef<ReturnType<typeof publicStatus>>; load(): Promise<void>; start(): void; pause(): void; resume(): void; skip(): void; reset(): void; setTask(label: string | null, projectId: string | null): void; saveSettings(settings: FocusSettings): void; createProject(name: string, color: SpaceColor): Promise<FocusProject | null>; updateProject(id: string, patch: { name?: string; color?: SpaceColor; archived?: boolean }): Promise<boolean>; enter(): () => void; dispose(): void }`
  - `focusStore: FocusStore` — the app singleton built with the real `api`, `Date.now`, `crypto.randomUUID`; `onSaveFailed` shows the toast `Focus progress not saved yet`, `onConflict` shows `Focus changed in another tab; reloaded` (both `source: 'Pomodoro'`); `onPhaseEnd` is a no-op until Task 6 wires the alerts.
  - `todayCount`: completed pomodoros of the local day; `load` fills it from `focusSessions(today, today)`; each completed session adds 1 when its `day` is today, otherwise sets it to 1.
  - `useFocusPresence(): void` — calls `focusStore.enter()` in `onMounted` and its returned leave function in `onUnmounted`; the first `enter` triggers `load()` when not loaded.

Behaviour (spec «store.ts»): one `setTimeout` to `endsAt`; `visibilitychange` re-runs `advance`; heartbeat every 30 000 ms while running; `enter`/leave count — leave to 0 while running → `pause(..., 'hidden')`; enter with run paused by `hidden` → `resume`; after `load` a running run goes through `restore`. Write chain: at most one `saveFocus` in flight; coalesce; unconfirmed sessions list, oldest carried first; retries after 2 000, 5 000, 15 000 ms, then every 60 000 ms; on `conflict` call `api.focus()`, adopt its settings/run/revision, keep unconfirmed sessions and call `onConflict`.

- [ ] **Step 1: Write the failing tests** (Vitest fake timers, a fake `api` recording calls, `effectScope`):
  - `load restores a running run as paused`: fake `focus()` returns a running run → `state.run.status === 'paused'`, `pausedBy: 'user'`.
  - `writes are serialized and coalesced`: `start`, `pause`, `resume` while the first save is pending → exactly 2 `saveFocus` calls; the second carries the last run and `expectedRevision` from the first answer.
  - `session survives failure and conflict`: phase completes; first save `unavailable`, retry `conflict`, then `ok` → the same session id sent on every attempt; `onSaveFailed` called once; `onConflict` called once; unconfirmed list empty at the end.
  - `retries continue after the third failure`: 4 failures then success → the 5th attempt happens 60 000 ms after the 4th.
  - `presence pauses and resumes only hidden pauses`: running; leave last view → `paused`/`hidden`; enter → `running`. Paused by `user`, leave and enter → stays `paused`.
  - `deadline timer fires advance`: running focus; advance timers by `durationMs` → `onPhaseEnd({ from: 'focus', to: 'short', nextMinutes: 5 })`, run `short`.
  - `heartbeat updates seenAt`: running; advance 30 000 ms → a save with `seenAt` = now.
  - `todayCount follows completed sessions`: load with 2 completed sessions today → 2; one more completed focus → 3; a completion whose `day` is tomorrow → 1.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -C apps/ui exec vitest run test/focus-store.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement** `apps/ui/app/focus/store.ts` and the `api` methods. Keep `createFocusStore` free of module-level state so tests build their own; the `focusStore` singleton is the only module-level instance.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -C apps/ui exec vitest run test/focus-store.test.ts test/focus-engine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/app/api.ts apps/ui/app/focus/store.ts apps/ui/test/focus-store.test.ts
git commit -m "feat(ui): focus store with presence and a serialized write chain"
```

---

### Task 5: Hold other widgets' toasts during focus

**Files:**
- Modify: `apps/ui/app/toasts.ts`
- Modify: `apps/ui/app/focus/store.ts` (watch `status` and call `holdToasts`)
- Test: `apps/ui/test/toasts.test.ts`

**Interfaces:**
- Produces: `holdToasts(hold: boolean): void`; `showToast(message: Omit<Toast, 'id'>, options?: { bypassHold?: boolean }): void` (existing callers unchanged).
- The store calls `holdToasts(status.phase === 'focus' && status.running)` whenever `status` changes.

- [ ] **Step 1: Write the failing tests**:
  - `held toasts are queued`: `holdToasts(true)`; 3 × `showToast` → `toasts.value` empty.
  - `bypass is shown while held`: `showToast(msg, { bypassHold: true })` → shown.
  - `flush shows five and a summary`: hold, 8 toasts, `holdToasts(false)` → 6 toasts; the last has `title: '+3 notifications while you focused'`.
  - `queue keeps the newest fifty`: hold, 60 toasts, release → the first 5 shown are numbers 11–15 and the summary says `+45`.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -C apps/ui exec vitest run test/toasts.test.ts`
Expected: FAIL (`holdToasts` is not exported).

- [ ] **Step 3: Implement** the queue in `toasts.ts`; summary toast `source: 'LifeDashboard'`, `body: ''`. Wire the store watch.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -C apps/ui exec vitest run test/toasts.test.ts test/focus-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/app/toasts.ts apps/ui/app/focus/store.ts apps/ui/test/toasts.test.ts
git commit -m "feat(ui): hold widget toasts while a focus interval runs"
```

---

### Task 6: Phase-end alerts and the Tauri notification plugin

**Files:**
- Create: `apps/ui/app/focus/alerts.ts`
- Modify: `apps/ui/package.json` (`"@tauri-apps/plugin-notification": "2.7.0"`), `pnpm-lock.yaml` (via `pnpm install`)
- Modify: `apps/desktop/src-tauri/Cargo.toml` (`tauri-plugin-notification = "=2.7.0"`), `Cargo.lock`, `apps/desktop/src-tauri/src/main.rs` (`.plugin(tauri_plugin_notification::init())` next to the dialog plugin), `apps/desktop/src-tauri/capabilities/main.json` (add `notification:allow-notify`, `notification:allow-request-permission`, `notification:allow-is-permission-granted`; description mentions notifications)
- Modify: `apps/ui/app/focus/store.ts` (singleton passes `onPhaseEnd` to alerts)
- Test: `apps/ui/test/focus-alerts.test.ts`

**Interfaces:**
- Produces:
  - `alertText(event: { from: FocusPhase; to: FocusPhase; nextMinutes: number }): string`
  - `createAlerts(deps: { isTauri: () => boolean; tauri: { isPermissionGranted(): Promise<boolean>; requestPermission(): Promise<string>; sendNotification(o: { title: string; body?: string }): void }; web: { permission(): NotificationPermission | 'unsupported'; request(): Promise<NotificationPermission>; show(title: string): void }; toast(text: string): void; chime(): void }): { prime(): Promise<void>; phaseEnded(event, sound: boolean): Promise<void> }`
  - `alerts` singleton wired to the real plugin module, `window.Notification`, `showToast(..., { bypassHold: true })` and a WebAudio chime (two tones, about 0.6 s total; the `AudioContext` is created in `prime`).
- `prime()` is called by the widget on the user's ▶ click: creates the `AudioContext` and requests notification permission.

- [ ] **Step 1: Write the failing tests**:
  - `texts use the actual length`: `{ from: 'focus', to: 'short', nextMinutes: 10 }` → `'Focus done — 10 min break'`; `to: 'long', nextMinutes: 20` → `'Focus done — 20 min long break'`; `from: 'short', to: 'focus'` → `'Break over — time to focus'`.
  - `desktop uses the plugin`: `isTauri: true`, permission granted → `sendNotification({ title: 'Pomodoro', body: text })`, no toast.
  - `browser uses Notification`: `isTauri: false`, permission `granted` → `web.show`.
  - `denied falls back to a toast`: permission `denied` → `toast(text)`.
  - `sound follows the setting`: `phaseEnded(e, false)` never calls `chime`.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -C apps/ui exec vitest run test/focus-alerts.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Add dependencies and implement**

Run: `pnpm -C apps/ui add @tauri-apps/plugin-notification@2.7.0 --save-exact`
Edit Cargo.toml, main.rs, capabilities; implement `alerts.ts`. Detect desktop with `'__TAURI_INTERNALS__' in window`. Import the plugin module lazily (`await import('@tauri-apps/plugin-notification')`) so web mode never loads it.

- [ ] **Step 4: Verify**

Run: `pnpm -C apps/ui exec vitest run test/focus-alerts.test.ts && PATH="$HOME/.cargo/bin:$PATH" cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: tests PASS; `cargo check` finishes without errors; `grep -A1 'name = "tauri-plugin-notification"' apps/desktop/src-tauri/Cargo.lock` shows `version = "2.7.0"`.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/app/focus/alerts.ts apps/ui/app/focus/store.ts apps/ui/test/focus-alerts.test.ts apps/ui/package.json pnpm-lock.yaml apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/Cargo.lock apps/desktop/src-tauri/src/main.rs apps/desktop/src-tauri/capabilities/main.json
git commit -m "feat(desktop): system notifications for focus phase ends"
```

---

### Task 7: `context.focus` and SDK level 7

Mirror commit `a39c0c2` (sdk 6, `contentScale`): the same files change for the same reasons.

**Files:**
- Modify: `packages/contracts/src/widget-gateway.ts` (`export interface FocusStatus { phase: 'none' | 'focus' | 'break'; running: boolean; endsAt: number | null }`; `WidgetContext.focus: FocusStatus` with `@since sdk 7`; `SDK_LEVELS` gains 7; `SDK_TARGET_LEVEL = 7`)
- Modify: `apps/ui/app/widgets/context.ts` (new source `focus: () => FocusStatus`, watched like `contentScale`), `apps/ui/app/widgets/WidgetHost.vue` (passes `focus: () => focusStore.status.value`), `apps/ui/app/widgets/modals.ts` if it builds a context
- Modify: `packages/widget-sdk/src/dev/shell-state.ts` (`focus: { phase: 'none', running: false, endsAt: null }`)
- Modify: `packages/widget-sdk/docs-src/api.md` (context table row, «Level 7» line, supported levels 1–7), `packages/widget-sdk/docs-src/recipes.md` (recipe «Defer noise during focus»); regenerate `packages/widget-sdk/docs/` with `pnpm -C packages/widget-sdk docs`
- Modify: `packages/create-widget/template/AGENTS.md` (one line: «`context.focus` tells whether the user is focusing; defer sounds, animations and `notify` while `phase === 'focus' && running`.»)
- Modify tests touched by a39c0c2 that pin the level or the context shape: `packages/contracts/test/widget-package.test.ts`, `packages/contracts/test/widget-modal.test.ts`, `packages/widget-sdk/test/build.test.ts` (`sdk: 7`), `packages/widget-sdk/test/shell-state.test.ts`, `packages/widget-sdk/test/widget.test.ts`, `apps/ui/test/widget-context.test.ts`, `apps/ui/test/widget-host.test.ts`, `apps/ui/test/widget-modal-controller.test.ts`

**Interfaces:**
- Consumes: `focusStore.status` (Task 4), `publicStatus` shape (Task 3).
- Produces: `WidgetContext.focus` for every widget; `FocusStatus` type.

- [ ] **Step 1: Write the failing tests**:
  - `apps/ui/test/widget-context.test.ts`: `context.focus follows the source` — source ref changes from `{ phase: 'none', running: false, endsAt: null }` to `{ phase: 'focus', running: true, endsAt: 123 }` → `context.focus` equals the new value after `nextTick`.
  - `packages/contracts/test/widget-package.test.ts`: a manifest with `sdk: 7` parses; `sdk: 8` fails with `needs a newer LifeDashboard (this one supports 1–7)`.
  - `packages/widget-sdk/test/build.test.ts`: built manifest has `sdk: 7`.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm -C apps/ui exec vitest run test/widget-context.test.ts && pnpm -C packages/contracts exec vitest run test/widget-package.test.ts && pnpm -C packages/widget-sdk exec vitest run test/build.test.ts`
Expected: FAIL on the new assertions.

- [ ] **Step 3: Implement** the contract, host wiring, dev shell, docs sources and template line; regenerate docs.

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm test`
Expected: all suites PASS, including `packages/widget-sdk/test/docs.test.ts` (docs not stale).

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/widget-gateway.ts apps/ui/app/widgets/context.ts apps/ui/app/widgets/WidgetHost.vue apps/ui/app/widgets/modals.ts packages/widget-sdk/src/dev/shell-state.ts packages/widget-sdk/docs-src packages/widget-sdk/docs packages/create-widget/template/AGENTS.md packages/contracts/test packages/widget-sdk/test apps/ui/test/widget-context.test.ts apps/ui/test/widget-host.test.ts apps/ui/test/widget-modal-controller.test.ts
git commit -m "feat(widget-sdk): focus status in the widget context (sdk 7)"
```

Stage only the files the step changed; drop paths from the list that did not change.

---

### Task 8: Settings block for an editor without a schema

**Files:**
- Modify: `apps/ui/app/board/WidgetSettings.vue:61` (`hasWidgetBlock`)
- Test: `apps/ui/test/widget-settings-panel.test.ts`

**Interfaces:**
- Produces: `hasWidgetBlock = Boolean(props.editor || (props.schema && Object.keys(props.schema.properties).length > 0))`; the editor receives `schema` `undefined` when there is none.

- [ ] **Step 1: Write the failing test** `shows the widget’s own editor without a schema`: `mount(OwnEditor, { schema: undefined })` → a node with tag `own-editor` exists and the `Widget` heading is present.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -C apps/ui exec vitest run test/widget-settings-panel.test.ts`
Expected: FAIL, no `own-editor` node.

- [ ] **Step 3: Change `hasWidgetBlock`** and update its comment to «A built-in editor needs no schema; the generic form needs at least one setting.»

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -C apps/ui exec vitest run test/widget-settings-panel.test.ts`
Expected: PASS, existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/app/board/WidgetSettings.vue apps/ui/test/widget-settings-panel.test.ts
git commit -m "fix(ui): show a built-in settings editor without a schema"
```

---

### Task 9: Pomodoro widget tile and asset

**Files:**
- Create: `apps/ui/app/widgets/builtin/pomodoro/tomato.webp`
- Create: `apps/ui/app/widgets/builtin/pomodoro/view.ts`
- Create: `apps/ui/app/widgets/builtin/pomodoro/Pomodoro.vue`
- Modify: `packages/contracts/src/builtin-widgets.ts` (manifest from the spec), `apps/ui/app/widgets/registry.ts` (`['pomodoro', defineAsyncComponent(() => import('./builtin/pomodoro/Pomodoro.vue'))]`)
- Test: `apps/ui/test/pomodoro-view.test.ts`, `packages/contracts/test/builtin-widgets.test.ts`

**Interfaces:**
- Consumes: `focusStore`, `useFocusPresence`, `alerts.prime`, `useWidget().context` (`size`, `visible`).
- Produces (`view.ts`, pure):
  - `formatClock(ms: number): string` — `mm:ss`, ceiling seconds; `0` → `'00:00'`.
  - `ringProgress(run: FocusRun, now: number): number` — 0…1 of elapsed time of `durationMs`.
  - `ringTone(run: FocusRun, doneToday: number, goal: number): 'focus' | 'break' | 'goal'`
  - `goalDots(doneToday: number, goal: number): { done: number; current: boolean; total: number } | { text: string }` — text `'5 / 16'` when `goal > 12`.
  - `isCompact(size: { w: number; h: number }): boolean` — `w < 5 || h < 5`.
- `Pomodoro.vue` reads the completed count from `focusStore.state.todayCount`.

- [ ] **Step 1: Make the asset** (tool run in the scratchpad, nothing added to the repo besides the image):

```bash
uvx --with pillow python - "/Users/csscoder/Downloads/Glossy Tomato Icon.png" apps/ui/app/widgets/builtin/pomodoro/tomato.webp <<'EOF'
import sys
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGBA')
im.thumbnail((800, 800), Image.LANCZOS)
w, h = im.size
alpha = im.getchannel('A').load()
seen, best = set(), []
for y in range(h):
    for x in range(w):
        if alpha[x, y] > 8 and (x, y) not in seen:
            stack, comp = [(x, y)], []
            seen.add((x, y))
            while stack:
                cx, cy = stack.pop(); comp.append((cx, cy))
                for nx, ny in ((cx+1, cy), (cx-1, cy), (cx, cy+1), (cx, cy-1)):
                    if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in seen and alpha[nx, ny] > 8:
                        seen.add((nx, ny)); stack.append((nx, ny))
            if len(comp) > len(best): best = comp
keep = set(best)
px = im.load()
for y in range(h):
    for x in range(w):
        if (x, y) not in keep: px[x, y] = (0, 0, 0, 0)
im.save(dst, 'WEBP', quality=86, method=6)
EOF
ls -l apps/ui/app/widgets/builtin/pomodoro/tomato.webp
```

Expected: the file exists and is at most 122 880 bytes; if larger, lower `quality` in steps of 4. Open it in Orca's browser on a dark page and confirm no stray red pixels around the tomato.

- [ ] **Step 2: Write the failing tests**:
  - `pomodoro-view.test.ts`: `formatClock(1_500_000) === '25:00'`, `formatClock(59_001) === '01:00'`, `formatClock(0) === '00:00'`; `ringProgress` for a running run half way is `0.5`, for paused uses `remainingMs`; `ringTone` returns `'goal'` when `doneToday >= goal` and the phase is not focus-running, `'break'` for short/long, else `'focus'`; `goalDots(4, 8)` → `{ done: 4, current: true, total: 8 }`, `goalDots(5, 16)` → `{ text: '5 / 16' }`; `isCompact({ w: 4, h: 6 }) === true`, `isCompact({ w: 6, h: 6 }) === false`.
  - `builtin-widgets.test.ts`: `findBuiltinWidget('pomodoro')` has `title: 'Pomodoro'`, `permissions: []`, sizing default 6×6, min 3×3, max 12×12, no `settings`.

- [ ] **Step 3: Run to verify they fail**

Run: `pnpm -C apps/ui exec vitest run test/pomodoro-view.test.ts && pnpm -C packages/contracts exec vitest run test/builtin-widgets.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement** `view.ts`, the manifest, the registry entry and `Pomodoro.vue`

Tile per the spec «Tile»: SVG ring (`pathLength="100"`, tones red `focus`, green `break`, gold `goal`), digits with `role="timer"`, goal dots, label line with project colour; hover/focus-within controls ⏸/▶ ⏭ ↺ with `aria-label`s `Pause`, `Start`, `Skip`, `Reset`; click on the tomato or Space toggles; ▶ calls `alerts.prime()` first; paused ring blinks unless `prefers-reduced-motion`; compact layout from `isCompact`; `requestAnimationFrame` only while `context.visible` and running; load error shows `Can't load focus` and a `Retry` button calling `focusStore.load()`. Call `useFocusPresence()` in setup. Size the face in `cq*` units like `ClockAnalog1.vue`.

- [ ] **Step 5: Run to verify they pass**

Run: `pnpm -C apps/ui exec vitest run test/pomodoro-view.test.ts test/catalog.test.ts && pnpm -C packages/contracts exec vitest run test/builtin-widgets.test.ts && pnpm -C apps/ui typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/ui/app/widgets/builtin/pomodoro packages/contracts/src/builtin-widgets.ts packages/contracts/test/builtin-widgets.test.ts apps/ui/app/widgets/registry.ts apps/ui/test/pomodoro-view.test.ts
git commit -m "feat(ui): built-in Pomodoro widget with a ring around the tomato"
```

---

### Task 10: Task picker and projects

**Files:**
- Create: `apps/ui/app/widgets/builtin/pomodoro/TaskPicker.vue`
- Modify: `apps/ui/app/widgets/builtin/pomodoro/Pomodoro.vue` (label line opens the picker)
- Test: `apps/ui/test/pomodoro-task-picker.test.ts` (mount with `test/helpers/sfc-renderer` like `widget-settings-panel.test.ts`, with a fake store)

**Interfaces:**
- Consumes: `focusStore.setTask`, `focusStore.createProject`, `state.recentLabels`, `state.projects` (non-archived only), `SPACE_COLORS`, `nextColor`.
- Produces: `<TaskPicker :store="FocusStore" @close />` — a reka-ui Popover anchored to the label.

- [ ] **Step 1: Write the failing tests**:
  - `submits a trimmed label`: input `'  Refactor grid  '` + Enter → `setTask('Refactor grid', currentProjectId)`.
  - `recent label click`: clicking `'Write spec'` → `setTask('Write spec', currentProjectId)`.
  - `new project`: name `'LifeDashboard'` with the default colour `nextColor(used)` → `createProject('LifeDashboard', color)` then `setTask(label, newId)`.
  - `clear`: `Clear` → `setTask(null, null)`.
  - `limits`: the input has `maxlength="120"`; the project name input `maxlength="40"`; an empty project name disables `Add`.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -C apps/ui exec vitest run test/pomodoro-task-picker.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** with house `UiTextField`, `UiSelect`, `UiButton` and reka-ui `PopoverRoot/PopoverTrigger/PopoverContent`. Placeholder `What are you working on?`; button `+ New project`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -C apps/ui exec vitest run test/pomodoro-task-picker.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/app/widgets/builtin/pomodoro/TaskPicker.vue apps/ui/app/widgets/builtin/pomodoro/Pomodoro.vue apps/ui/test/pomodoro-task-picker.test.ts
git commit -m "feat(ui): task label and project picker for the Pomodoro"
```

---

### Task 11: Statistics and projects dialog

**Files:**
- Create: `apps/ui/app/widgets/builtin/pomodoro/stats.ts`
- Create: `apps/ui/app/widgets/builtin/pomodoro/FocusStatsDialog.vue`
- Modify: `apps/ui/app/widgets/builtin/pomodoro/Pomodoro.vue` (corner icon button `Statistics`, visible on hover/focus)
- Test: `apps/ui/test/pomodoro-stats.test.ts`

**Interfaces:**
- Consumes: `api.focusSessions`, `focusStore.updateProject`, `state.projects`, `settings.dailyGoal`, `dayKey`.
- Produces (`stats.ts`, pure):
  - `todaySessions(sessions: FocusSession[], today: string): FocusSession[]` — ordered by `endedAt`.
  - `weekBars(sessions: FocusSession[], today: string, goal: number): { day: string; pomodoros: number; goal: number }[]` — 7 entries ending today.
  - `focusHours(sessions: FocusSession[]): number` — sum of `focusMs` / 3 600 000, one decimal.
  - `projectShares(sessions: FocusSession[], projects: FocusProject[]): { projectId: string | null; name: string; color: SpaceColor | null; minutes: number }[]` — sorted by minutes, `null` project named `No project`.
- `FocusStatsDialog.vue`: native `<dialog>` with `showModal()` like `PackagesDialog.vue`; tabs `Today`, `Week`, `Projects`; Projects has a `Week`/`Month` switch and rename/colour/archive per project. Bars are HTML/SVG.

- [ ] **Step 1: Write the failing tests**:
  - `today uses local day keys`: sessions on `2026-10-29` and `2026-10-30` → only the first for `today = '2026-10-29'`.
  - `week bars`: 7 entries, oldest first, zero-filled, only `completed` sessions counted as pomodoros, `goal` copied.
  - `focus hours include interrupted sessions`: 2 × 1 500 000 + 1 × 600 000 ms → `1.0`.
  - `project shares`: minutes per project, `No project` bucket, sorted descending.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -C apps/ui exec vitest run test/pomodoro-stats.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** `stats.ts` and the dialog.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -C apps/ui exec vitest run test/pomodoro-stats.test.ts && pnpm -C apps/ui typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/app/widgets/builtin/pomodoro/stats.ts apps/ui/app/widgets/builtin/pomodoro/FocusStatsDialog.vue apps/ui/app/widgets/builtin/pomodoro/Pomodoro.vue apps/ui/test/pomodoro-stats.test.ts
git commit -m "feat(ui): Pomodoro statistics and projects dialog"
```

---

### Task 12: Pomodoro settings editor

**Files:**
- Create: `apps/ui/app/widgets/builtin/pomodoro/PomodoroSettings.vue`
- Modify: `apps/ui/app/widgets/registry.ts` (`builtinSettingsEditors` entry `pomodoro`)
- Test: `apps/ui/test/pomodoro-settings.test.ts`

**Interfaces:**
- Consumes: `focusStore.state.settings`, `focusStore.saveSettings`, `FOCUS_LIMITS`, house `UiNumberField`, `UiSwitch`, `SettingsRow`.
- Produces: an editor that ignores its `config`/`schema` props and never emits `change`.

- [ ] **Step 1: Write the failing tests**:
  - `fields and bounds`: number fields `Focus, min` (1–120), `Short break, min` (1–60), `Long break, min` (1–60), `Long break after` (2–12), `Daily goal` (1–24); switches `Auto-start breaks`, `Auto-start focus`, `Sound`; the note `Shared by all Pomodoro widgets`.
  - `a change saves settings`: changing `Daily goal` to 10 → `saveSettings({ ...current, dailyGoal: 10 })`; no `change` event emitted.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -C apps/ui exec vitest run test/pomodoro-settings.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** the editor and the registry entry.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -C apps/ui exec vitest run test/pomodoro-settings.test.ts test/widget-settings-panel.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/app/widgets/builtin/pomodoro/PomodoroSettings.vue apps/ui/app/widgets/registry.ts apps/ui/test/pomodoro-settings.test.ts
git commit -m "feat(ui): shared Pomodoro settings editor"
```

---

### Task 13: Full verification and acceptance

**Files:** none changed unless a check fails (then fix in the owning task's files with a failing test first).

- [ ] **Step 1: Automated checks**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: all exit 0.

- [ ] **Step 2: Browser acceptance** (`pnpm dev`, Orca's built-in browser on `http://127.0.0.1:3000`; set focus 1, short 1, long 1, long after 2, goal 3)

Record pass/fail for each:
1. Add Pomodoro; ▶ grants notification permission; ring red, digits count down.
2. Focus ends: browser notification `Focus done — 1 min break`, chime, green ring, session in `Today`.
3. Another widget's `notify` during focus (`examples/widgets/hello` installed) is held and appears after the focus ends.
4. Switch to another screen mid-focus, wait 20 s, return: time did not advance and the timer resumes.
5. Pause with ⏸, switch screens and back: stays paused.
6. Reload mid-focus: run restored paused with at most 30 s lost.
7. The second pomodoro is followed by the long break; after the third the goal is met: gold ring, `3 / 3` and today's focus total.
8. Task picker: label, recent labels, new project; stats `Week` and `Projects` show the data.
9. Settings editor appears in the widget settings panel; changing focus length mid-focus does not change the running ring.
10. Compact layout at 4×4.

- [ ] **Step 3: Desktop acceptance**

Run: `PATH="$HOME/.cargo/bin:$PATH" pnpm -C apps/desktop run package`, install the `.dmg`, start a 1-minute focus, put another application in front of the window.
Expected: macOS notification arrives within a few seconds of the deadline. Record the observed delay; a long delay is the spec «Risks» item and is reported, not fixed here.

- [ ] **Step 4: Report** results, deviations and open risks to the user. No commit unless a fix was made.
