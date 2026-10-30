# Pomodoro widget and dashboard focus status

Status: design approved in chat on 2026-10-29 (5 sections); Codex review approved (3 rounds); user-approved amendment of the 409 rule after the plan review (2026-10-29).

Branch: `feat/pomodoro-focus`, from `main` at `387fd98`.

## Goal

1. A built-in **Pomodoro** widget makes focused work effective: configurable focus, short-break and long-break durations, the long-break interval, a daily goal in pomodoros, a task label and an optional project per session, and per-day history with statistics.
2. The remaining time is shown as a glowing ring around the user-supplied glossy tomato image (`tomato.webp`).
3. The dashboard has one **global focus status**. Every widget can read it, and while a focus interval runs the host holds the notifications of other widgets and delivers them at the next break.
4. A phase end raises a **system notification** (macOS Notification Center in the desktop app, the Web Notification API in the browser) and a sound.

The widget is a basic, opinionated focus tool, not a task manager. Hermes Tasks remains the task manager; integrating it is out of scope.

## Current state (2026-10-29)

- `WidgetBoard.vue` mounts only the active screen's widgets. Switching a screen or a space unmounts every other widget.
- Widget state (`widget.state`) is limited to `STATE_MAX_BYTES = 65_536` per instance (`packages/contracts/src/widget-gateway.ts`). Deleting a widget deletes its `widget_state` row (`apps/api/src/spaces.ts:241`, `:320`).
- `widget.notify()` ends in `showToast` (`apps/ui/app/toasts.ts`), an in-app toast for 6 s. No system notifications exist.
- Built-in widgets are registered in `BUILTIN_WIDGETS` (`packages/contracts/src/builtin-widgets.ts`), `builtinWidgetRenderers` and `builtinSettingsEditors` (`apps/ui/app/widgets/registry.ts`). They are trusted in-process Vue code.
- The settings panel shows the «Widget» block only when the widget has a settings schema: `hasWidgetBlock` in `apps/ui/app/board/WidgetSettings.vue` requires `props.schema` even for a built-in editor.
- `WidgetContext` gained `contentScale` at sdk 6 (commit `a39c0c2`); `useWidgetContext` (`apps/ui/app/widgets/context.ts`) keeps it reactive and `SandboxWidget.vue` sends context changes to the frame.
- `packages/widget-sdk/docs/` is generated from `packages/widget-sdk/docs-src/` by `scripts/docs.ts`; the package build fails when `docs/` is stale (`scripts/build.ts`).
- The desktop app (`apps/desktop`) uses Tauri 2.12.3 with only `tauri-plugin-dialog`. Its capability `main-window` grants window dragging to the remote URL `http://127.0.0.1:3101/*`. `tauri.conf.json` `identifier` is `dev.lifedashboard.desktop`; the bundle is ad-hoc signed.
- The UI language is English (widget titles, toasts).
- `SpaceColor` (`packages/contracts/src/space.ts`) is the existing 8-colour palette.

## Research (checked 2026-10-29)

Reference products, for scope:

- Focus To-Do (https://www.focustodo.cn/#features): pomodoro timer, tasks with subtasks, due dates, reminders, repeats and notes, projects, reports by day/week/month with project time ratio, cross-device sync. Further details (estimated pomodoros per task, strict mode, white noise, auto-start, long-break interval, daily goal) come from a Perplexity search, not the vendor page.
- Be Focused (https://xwavesoft.com/be-focused-pro-for-iphone-ipad-mac-os-x.html): work, short-break and long-break lengths, daily target, intervals before a long break, start/pause/skip, auto-start next timer, tasks, goal tracking by day/week/custom period, CSV export, alarm and ticking sounds, sync.

Taken: the timer settings, daily goal, auto-start, a task label and lightweight projects, per-day/week/project statistics, phase-end sound and notification. Left out: see «Out of scope».

Notification plugin:

- `tauri-plugin-notification` stable releases on crates.io: 2.8.0 (2026-10-28), **2.7.0 (2026-10-14)**, 2.6.0 (2026-10-10); MSRV 1.90. `@tauri-apps/plugin-notification` on npm has the same versions. Source: https://crates.io/api/v1/crates/tauri-plugin-notification/versions, https://registry.npmjs.org/@tauri-apps/plugin-notification. 2.8.0 is one day old, so this feature pins **2.7.0**; 3.0.0 exists only as alpha.
- The plugin does not replace `window.Notification`; native notifications go through its JS API (`isPermissionGranted`, `requestPermission`, `sendNotification`). A remote-URL page needs the permissions in a capability whose `remote.urls` match it. Source: https://v2.tauri.app/plugin/notification/ (via Perplexity, 2026-10-29).
- macOS ties the notification permission to the bundle identity: ad-hoc signing works locally, but a changed `identifier` asks for permission again. This is a limitation, not a blocker.

## Decisions

- One spec: the focus platform (host engine, API storage, notification hold, `context.focus`) is the foundation, the widget is built on it.
- **The focus engine lives in the UI host**, not in the widget and not in the API. Time is wall-clock based (`endsAt`, `remainingMs`), never tick counting.
- **One focus session per dashboard.** The timer runs while at least one Pomodoro widget is mounted. When none is mounted (another screen or space is shown, the widget is removed), the session pauses. Minimising the window or switching to another application does **not** pause it.
- History, projects, settings and the current run live in new API tables, not in widget state: widget state is 64 KB per instance and is deleted with the widget.
- Task model: a free-text label plus an optional project (name and colour). No task list, no estimates.
- Visual: variant C, a ring around an intact tomato. Red ring for focus, green for breaks, gold when the daily goal is met. Controls appear on hover or keyboard focus.
- Settings are global, shared by all Pomodoro widgets, edited through the widget's built-in settings editor.
- Third-party widgets read only the phase, whether it runs and its end time. They never see the label, the project or history, and they cannot write focus state.
- Holding notifications of other widgets is done by the host for every widget, whatever its sdk level; `context.focus` is an addition for widgets that want to adapt themselves.
- Only the Pomodoro's own alerts become system notifications; `notify()` of other widgets stays an in-app toast.

## Data and API

### Tables (one new migration in `apps/api/src/migrations.ts`)

```sql
CREATE TABLE focus (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  settings TEXT NOT NULL,   -- FocusSettings JSON
  run TEXT NOT NULL,        -- FocusRun JSON
  revision INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE focus_projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,      -- SpaceColor
  archived_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE focus_sessions (
  id TEXT PRIMARY KEY,
  day TEXT NOT NULL,        -- local date YYYY-MM-DD of ended_at, computed by the UI
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  planned_ms INTEGER NOT NULL,
  focus_ms INTEGER NOT NULL, -- time actually focused, pauses excluded
  completed INTEGER NOT NULL, -- 1: ran to the end
  label TEXT,
  project_id TEXT REFERENCES focus_projects(id)
);
CREATE INDEX focus_sessions_day ON focus_sessions(day);
```

The `focus` row is created on first read with default settings and the initial run: `phase: 'focus'`, `status: 'ready'`, `durationMs = remainingMs = focusMin × 60_000` (1 500 000 ms for the default 25 min), every other field `null`, `0` or empty. Projects are archived, never deleted, so history keeps its references.

### Contracts (`packages/contracts/src/focus.ts`)

```ts
export interface FocusSettings {
  focusMin: number         // 1–120, default 25
  shortBreakMin: number    // 1–60, default 5
  longBreakMin: number     // 1–60, default 15
  longBreakEvery: number   // 2–12, default 4
  dailyGoal: number        // 1–24, default 8
  autoStartBreak: boolean  // default true
  autoStartFocus: boolean  // default false
  sound: boolean           // default true
}

export type FocusPhase = 'focus' | 'short' | 'long'

export interface FocusRun {
  phase: FocusPhase
  status: 'ready' | 'running' | 'paused'
  durationMs: number           // full length of the current phase, fixed when the phase begins
  endsAt: number | null        // epoch ms, set when running
  remainingMs: number          // time left; authoritative when ready or paused
  resumedAt: number | null     // epoch ms of the last start or resume, set when running
  pausedBy: 'user' | 'hidden' | null
  phaseStartedAt: string | null // ISO, first start of the current focus interval
  focusedMs: number            // focus time of the current interval up to resumedAt
  streak: number               // completed pomodoros since the last long break
  label: string | null         // ≤ 120 characters
  projectId: string | null
  seenAt: number | null        // epoch ms, heartbeat while running
}

export interface FocusSessionInput {
  id: string; day: string; startedAt: string; endedAt: string
  plannedMs: number; focusMs: number; completed: boolean
  label: string | null; projectId: string | null
}

export interface FocusProject { id: string; name: string; color: SpaceColor; archivedAt: string | null }
```

Parsers follow the `ParseResult` style of `parseSpacePatch`: unknown keys, out-of-range numbers, a label over 120 characters, a project name outside 1–40 characters and an unknown colour are rejected.

### Endpoints (`apps/api/src/focus.ts`, registered like `registerSpaces`)

| Method and path | Body | Result |
| --- | --- | --- |
| `GET /api/v1/focus` | — | `{ settings, run, revision, projects, recentLabels }`; `recentLabels` is the 200 most recent distinct non-empty labels, most recent first. |
| `PUT /api/v1/focus` | `{ settings?, run, session?, expectedRevision }` | `{ revision }`. One transaction: write settings and run, insert the session. A stale revision is 409 `CONFLICT`. An unknown `projectId` is 400. |
| `GET /api/v1/focus/sessions?from=YYYY-MM-DD&to=YYYY-MM-DD` | — | Sessions with `day` in the range, ordered by `ended_at`. The range is at most 366 days; a longer or invalid one is 400. |
| `POST /api/v1/focus/projects` | `{ name, color }` | The created project. |
| `PATCH /api/v1/focus/projects/:id` | `{ name?, color?, archived? }` | The updated project. |

A session is inserted with `INSERT OR IGNORE` on its client-generated `id`, so a repeated `PUT` never duplicates it.

Statistics (day, week, project shares) are aggregated in the UI from the sessions list.

### What is recorded

- Only focus intervals are recorded; breaks are not.
- A focus interval that runs to its end: `completed = true`; it counts toward the daily goal and `streak`.
- A focus interval that is skipped or reset after at least 1 minute of focus: `completed = false`; its minutes count as focus time, it is not a pomodoro. Under 1 minute nothing is recorded.
- `day` is the local date of `ended_at`.

## Host focus engine (`apps/ui/app/focus/`)

### `engine.ts`

Pure functions over `(settings, run, now)` returning `{ run, session? }`; no timers, no I/O.

**Deadline first.** Every action on a `running` run (`pause`, `skip`, `reset`, a presence pause) first applies `advance(now)`. A phase whose `endsAt` has passed therefore ends exactly once, as completed, at `endsAt`; the action then applies to the next phase only if it is `running` (otherwise it is a no-op).

- `begin(phase, settings, autoStart, now)` (internal): a new phase with `durationMs` from the settings at this moment (minutes × 60 000), `remainingMs = durationMs`, `focusedMs = 0`, `phaseStartedAt = null`, `status: 'ready'`; when `autoStart`, it then applies `start(now)`, so an auto-started phase gets `endsAt`, `resumedAt`, `seenAt` and, for focus, `phaseStartedAt`.
- `start(now)`: `ready` → `running`; `endsAt = now + remainingMs`, `resumedAt = seenAt = now`; `phaseStartedAt` is set to `now` if it is `null`.
- `pause(now, by)`: `running` → `paused`; `remainingMs = endsAt − now`, `focusedMs += now − resumedAt` (focus phase only), `resumedAt = null`, `pausedBy = by`.
- `resume(now)`: `paused` → `running`, like `start` (including `resumedAt = seenAt = now`).
- `advance(now)`: if `running` and `now ≥ endsAt`, finish the phase at `endsAt`:
  - focus → session with `completed = true`, `plannedMs = durationMs`, `focusMs = focusedMs + (endsAt − resumedAt)`, `endedAt = endsAt`; `streak + 1`; next phase is `long` when the new `streak` is a multiple of `longBreakEvery` (then `streak` resets to 0), otherwise `short`; it begins with `autoStartBreak`;
  - a break → `focus`, begun with `autoStartFocus`.
- `skip(now)`: ends the current phase early and moves to the same next phase as a natural end, always `ready` (no auto-start). A skipped focus does not raise `streak` and records a session per «What is recorded». Skipping a `ready` phase records nothing.
- `reset(now)`: the current phase returns to `ready` with `remainingMs = durationMs`, `focusedMs = 0`, `phaseStartedAt = null`; a focus interval records a session per «What is recorded».
- `restore(run)`: for a run loaded as `running`, return it `paused` by `user` with `remainingMs = endsAt − seenAt` and `focusedMs += seenAt − resumedAt` (focus phase only). Time after the last heartbeat, including while the app was closed, is never counted. If `seenAt ≥ endsAt`, the phase is finished by `advance(endsAt)` instead.
- `dayKey(date)`: local `YYYY-MM-DD`.

New settings never change the current phase: its `durationMs`, `remainingMs` and `endsAt` stay; the next `begin` uses the new values. `durationMs` drives the ring, `plannedMs` and `reset`.

### `store.ts`

A singleton shared by every Pomodoro widget:

- Loads `GET /api/v1/focus` on the first mounted widget; exposes reactive `settings`, `run`, `projects`, `recentLabels`, `loadError`.
- One `setTimeout` to `endsAt` calls `advance`; `visibilitychange` re-runs `advance` in case a timer was throttled. No per-second ticks.
- While running, `seenAt` is refreshed every 30 s. Every transition to `running` sets `seenAt = resumedAt`, so a stored running run always has `seenAt ≥ resumedAt`.
- **One write chain.** Writes (state changes and heartbeats) are serialized: at most one `PUT` is in flight; the next one carries the latest local run and the revision the previous answer returned. Several changes made while a write is in flight are coalesced into one `PUT` with the latest run. Each session produced by the engine joins a list of unconfirmed sessions; a `PUT` carries the oldest one, and a session leaves the list only when a `PUT` carrying it succeeds.
- A failed write (network, 5xx) retries after 2, 5 and 15 s, then every 60 s while the app runs.
- A write whose outcome is unknown (network error or timeout) is re-sent **unchanged** (same body, same `expectedRevision`) until its outcome is known; local changes made meanwhile wait and are sent after it. On 409 the store re-reads `GET /api/v1/focus`:
  - if the server run equals the run of that pending write (both normalized by `parseFocusRun`), the write had landed without an answer: the store takes the server revision, treats the write as confirmed and continues with the waiting changes;
  - otherwise it is a real conflict (another tab): the store takes the server's settings and run, drops the local run change and keeps the unconfirmed sessions, which the next `PUT` sends again;
  - if the re-read fails, nothing is adopted: the local state and the pending write stay, and the attempt counts as a failed retry.
  - `INSERT OR IGNORE` makes a session that was already stored harmless in every case.
- Presence: `useFocusPresence()` is called by each mounted widget. When the count reaches 0 while running, the store pauses with `pausedBy: 'hidden'`. When a widget mounts again in the same app session and the run is paused by `hidden`, it resumes. A run paused by `user`, or restored after a reload, waits for ▶.
- Exposes the public status `{ phase: 'none' | 'focus' | 'break'; running: boolean; endsAt: number | null }` for `context.focus` and for the notification hold.

### Phase-end alerts (`apps/ui/app/focus/alerts.ts`)

- **Sound** (when `settings.sound`): a two-tone chime synthesised with WebAudio, about 0.6 s; no audio file. The `AudioContext` is created on the first ▶ click, so autoplay rules do not block it.
- **System notification**: in the desktop app (`'__TAURI_INTERNALS__' in window`) through `@tauri-apps/plugin-notification`; in the browser through `Notification`. Permission is requested on the first ▶ click. Texts use the next phase's actual length: «Focus done — {n} min break», «Focus done — {n} min long break», «Break over — time to focus».
- Without permission, the alert is an in-app toast.

### Holding notifications of other widgets (`apps/ui/app/toasts.ts`)

- While the focus status is `focus` and `running`, `showToast` queues toasts in memory instead of showing them; the queue holds at most 50, dropping the oldest.
- When focus stops running (phase ends, pause, reset, skip), the queue is flushed: up to 5 toasts, then one toast «+N notifications while you focused».
- The Pomodoro's own alerts bypass the hold.

## Widget contract (SDK)

- `WidgetContext.focus: { phase: 'none' | 'focus' | 'break'; running: boolean; endsAt: number | null }`, documented `@since sdk 7`. `focus` is the focus phase while `running` or `paused`; `break` is a `short` or `long` phase in any status; `none` is a focus phase in `ready` (nothing started). `running` is `status === 'running'`; `endsAt` is set only then.
- `SDK_LEVELS` gains 7 and `SDK_TARGET_LEVEL` becomes 7. Like `contentScale`, the field is sent to packages of every level and needs no permission.
- `useWidgetContext` reads the store's public status and keeps `context.focus` reactive; the existing context sync delivers it to sandboxes and built-ins.
- No gateway operation writes focus state. The built-in Pomodoro imports `focus/store` directly.
- Docs: edit the sources `packages/widget-sdk/docs-src/api.md` (context field, «Level 7») and `docs-src/recipes.md` (defer sounds, animations and `notify` while `focus.phase === 'focus' && focus.running`), then regenerate `docs/` with the package's docs script; add one line to the create-widget template `AGENTS.md`. The dev shell's context has `focus: { phase: 'none', running: false, endsAt: null }`.

## Pomodoro widget

### Manifest (`BUILTIN_WIDGETS`)

```ts
{
  type: 'pomodoro',
  title: 'Pomodoro',
  sizing: { default: { w: 6, h: 6 }, min: { w: 3, h: 3 }, max: { w: 12, h: 12 } },
  permissions: [],
}
```

No manifest `settings`: settings are global. Files live in `apps/ui/app/widgets/builtin/pomodoro/`.

### Tile (`Pomodoro.vue`)

- `tomato.webp` with an SVG ring around it; timer digits centred on the tomato; goal dots on top (current pomodoro outlined); the task label with the project colour dot on the tomato above the digits.
- During a break the label reads «Take a break» (long break: «Long break») and still opens the task picker; the tomato sleeps: «z z Z» drift from its top-right shoulder and it breathes slowly (gsap, already a dependency); static letters under `prefers-reduced-motion`; animated only while `context.visible`.
- Ring colours: focus red, breaks green, goal met gold (the tile then shows «8 / 8» and today's focus total).
- A goal over 12 shows «5 / 16» instead of dots.
- Compact layout when the tile is narrower or shorter than 5 cells: only the ring and digits.
- Controls ⏸/▶, ⏭ (skip, only during a break, so a focus is never closed by a stray click), ↺ (reset) appear on hover and on keyboard focus. Clicking the tomato or pressing Space toggles start/pause. Buttons have `aria-label`; the digits have `role="timer"`.
- Paused: the ring blinks slowly. Ready and paused: a ▶ button under the digits; the digits stay centred either way.
- The ring redraws with `requestAnimationFrame` only while `context.visible` and running.
- `prefers-reduced-motion`: no blink, no glow animation.
- Load failure: «Can't load focus» with «Retry».

### Task picker (`TaskPicker.vue`)

A Reka popover from the label: input «What are you working on?» (≤ 120 characters) with a dropdown of the 10 most recent labels that, while typing, lists every recent label containing the text (case-insensitive), the typed text first, a project select with «+ New project» (name and `SpaceColor`), «Clear». A change during a running focus applies to the current session.

### Statistics and projects (`FocusStatsDialog.vue`)

An icon button in the top-right corner (hover/focus) opens a host dialog with tabs:

- **Today**: sessions with time, label, project, minutes, completed mark.
- **Week**: 7 day bars of pomodoros against the goal, total hours.
- **Projects**: focus minutes per project for the week or the month; rename, colour, archive.

Bars are plain HTML/SVG; no chart library.

### Settings editor (`PomodoroSettings.vue`)

Registered in `builtinSettingsEditors`. Fields for every `FocusSettings` value with the house `Ui*` controls, and the note «Shared by all Pomodoro widgets». It writes to the store, not to the instance config. A change applies from the next phase (see `engine.ts`).

`WidgetSettings.vue` changes `hasWidgetBlock` so a built-in with its own editor shows the «Widget» block without a schema: `Boolean(props.editor || (props.schema && Object.keys(props.schema.properties).length > 0))`. The editor receives no schema in that case and must not need one.

### Assets

- `tomato.webp`, about 800 px, at most 120 KB, made once from the user's `Glossy Tomato Icon.png` with `uvx --with pillow` (a tool run, nothing added to the project). The script keeps only the largest connected opaque region, which removes the stray red specks on the transparent background.

## Desktop

- `apps/desktop/src-tauri/Cargo.toml`: `tauri-plugin-notification = "=2.7.0"` (exact; a plain `"2.7.0"` would allow 2.8.0), with the matching `Cargo.lock` entry; `main.rs`: `.plugin(tauri_plugin_notification::init())`.
- `apps/ui/package.json`: `"@tauri-apps/plugin-notification": "2.7.0"` (exact).
- `capabilities/main.json`: add `notification:allow-notify`, `notification:allow-request-permission`, `notification:allow-is-permission-granted`; update the capability description.
- Rust is in `~/.cargo/bin`, which is not on this shell's `PATH`; the build adds it.

## Error handling

- `GET /focus` fails: the widget shows «Can't load focus» and «Retry»; the timer cannot start.
- `PUT` fails (network, 5xx): the local run continues; the write chain retries (see `store.ts`); the first failure shows one toast «Focus progress not saved yet». Unconfirmed sessions stay in the list until a `PUT` carrying them succeeds; they are lost only if the app closes before that.
- 409 from our own landed write (see `store.ts`): no toast, the local run is kept. A real 409: the store re-reads the server state, drops the local run change, keeps and re-sends unconfirmed sessions, and shows a toast.
- No notification permission: in-app toast.
- 400 from validation: the UI prevents invalid input; a 400 is shown next to the field.

## Testing

Vitest, following the repo's conventions; each behaviour change starts with a failing test.

- `packages/contracts`: settings bounds, run, session and project parsers.
- `engine.ts`: the initial run and every phase transition; long break on each `longBreakEvery`-th pomodoro; skip goes to the natural next phase in `ready` without raising `streak`; a skipped or reset focus records only after 1 minute; `hidden` and `user` pauses and resume; a pause, skip or reset after `endsAt` first completes the phase exactly once at `endsAt`; changed settings leave the current phase's `durationMs` and apply to the next phase; `restore`: work → heartbeat → reload → resume → skip records the focus time up to the heartbeat plus the time after the resume; a reload right after `start` or `resume`, before any heartbeat, restores the full remaining time and no negative focus time; break → auto-started focus → completed session has `startedAt` set; the initial run is 1 500 000 ms with default settings; `dayKey` at local midnight.
- `store.ts`: writes are serialized and coalesced; a session survives a failed `PUT` and a 409 and is re-sent; retries continue after the third failure.
- `WidgetSettings.vue`: the Pomodoro, without a schema, shows its editor in the «Widget» block.
- API: defaults on first read; revision conflict; session insert and run update in one transaction; the 366-day range limit; project create, rename and archive; the migration.
- UI: the toast hold queue (limit 50, flush 5 + «+N»); store pause when presence drops to 0 (fake timers); `context.focus` in `useWidgetContext`.
- SDK: level 7 accepted in manifests and written by `ld-widget build`.
- Manual acceptance in Orca's built-in browser, with 1-minute durations: a full cycle; switching screens pauses and returning resumes; a reload restores a paused run; the browser notification; a toast from another widget is held and flushed; statistics.
- Desktop: `pnpm -C apps/desktop run package`; a system notification arrives while the window is behind another application.

## Risks

- WebKit may throttle timers when the Tauri window is occluded, delaying the phase-end notification. Desktop acceptance checks it; a native scheduled notification would be a separate change.
- macOS asks for notification permission again if the bundle identifier changes.

## Out of scope

Sync, strict mode, white noise and ticking, subtasks, due dates, reminders, estimated pomodoros, CSV export, system notifications for other widgets' `notify()`, Hermes Tasks integration, editing or deleting history entries, native scheduled notifications.
