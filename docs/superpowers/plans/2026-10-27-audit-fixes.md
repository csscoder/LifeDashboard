# Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the 2026-10-27 audit findings (finding 17 withdrawn) in order of risk, each with a test that fails first.

**Architecture:** Small, independent fixes in the existing modules: the Fastify auth and sandbox hooks, the widget gateway and its rate limiter, the UI board, confirmation and modal code, the shared contracts parsers, the widget SDK build, the create-widget CLI and the Tauri wrapper. No new modules except one address check in contracts.

**Tech Stack:** TypeScript strict, Node.js 24, Fastify 5.12.5, node:sqlite, Vue 3 / Nuxt 4, Vitest 5, undici 8.11.2 (new), Rust / Tauri 2.

**Spec:** `docs/superpowers/specs/2026-10-27-audit-fixes-design.md`

## Global Constraints

- TDD for every task: write the test, run it and see it fail for the stated reason, then implement. Rust edits (Task 10) are the only exception: no `cargo` here.
- Only new dependency: `undici` `8.11.2`, exact version, in `packages/contracts` `dependencies` (Task 14).
- Commits on `fix/audit-findings` only; message `<type>: <subject>`, no attribution trailers.
- Do not re-validate stored data: installed manifests, stored versions, saved titles.
- User-visible text is English.
- Never write raw invisible or bidi control characters into source or docs; use `\uXXXX` escapes in code.
- Run narrow checks per task: `pnpm -C <package> exec vitest run <file>`; `pnpm -C <package> typecheck` before each commit.

## Review Focus

1. Path tricks other than `%61` (trailing slash, double slash, `%2561`): a request that reaches an `/api` handler always goes through the auth checks — pinned in Task 1.
2. A second «Done» after a conflict, before «Cancel»: the notice repeats and the edits stay — pinned in Task 3.
3. Declines from one widget must not block another widget, and a widget with a board surface and a modal surface counts once per `widgetId` — pinned in Task 6.
4. Legitimate text with ZWJ emoji sequences or ZWNJ (Persian) must stay valid — pinned in Task 8.
5. IPv4-mapped IPv6 and IPv6 private ranges (`::ffff:127.0.0.1`, `fd00::1`, `fe80::1`) must count as private — pinned in Task 14.

---

## Phase A — critical

### Task 1: Auth and sandbox checks by the matched route

**Files:**
- Modify: `apps/api/src/auth.ts:26-29,68-82,105-110`
- Modify: `apps/api/src/sandbox.ts:65-70`
- Test: `apps/api/test/auth.test.ts`, `apps/api/test/sandbox.test.ts`

**Interfaces:**
- Produces: `checkRequest(request: FastifyRequest, route: string): void` (the second parameter is the route pattern, no longer the raw path). `PUBLIC_PATHS` holds route patterns. `UPLOAD_FILE_ROUTE = '/api/v1/widget-uploads/:uploadId/files/*'` replaces the `UPLOAD_FILE_PATH` regex — read the exact pattern from `widget-uploads.ts` before writing it.

- [ ] **Step 1: Write the failing tests** in `auth.test.ts` (`describe('request checks')`):

```ts
it.each(['/%61pi/v1/spaces', '/%2561pi/v1/spaces', '//api/v1/spaces', '/api/v1/spaces/'])('never answers %s without a session', async (url) => {
  const response = await call(t.app, { url })
  expect(response.statusCode).not.toBe(200)
  expect([401, 404]).toContain(response.statusCode)
})

it('checks Host on an encoded API path', async () => {
  const response = await call(t.app, { method: 'POST', url: '/%61pi/v1/spaces', host: 'evil.example:3001', payload: {} })
  expect([response.statusCode, errorCode(response)]).toEqual([403, 'FORBIDDEN'])
})
```

In `sandbox.test.ts`: `GET /%73andbox/runtime/<an existing runtime file>` with `host: 'evil.example:3001'` → 403 `FORBIDDEN`.

- [ ] **Step 2: Run and see them fail**

Run: `pnpm -C apps/api exec vitest run test/auth.test.ts test/sandbox.test.ts`
Expected: FAIL — `/%61pi/v1/spaces` answers 200; the POST answers 200.

- [ ] **Step 3: Implement**

Both `onRequest` hooks read `request.routeOptions.url` instead of `request.url`. The auth hook returns when it is `undefined` or does not start with `/api/`; `PUBLIC_PATHS.has(route)` and the raw-upload check compare the pattern. The sandbox hook uses the same pattern test with `/sandbox/`.

- [ ] **Step 4: Run and see them pass**, then the whole API suite

Run: `pnpm -C apps/api test && pnpm -C apps/api typecheck`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/auth.ts apps/api/src/sandbox.ts apps/api/test/auth.test.ts apps/api/test/sandbox.test.ts
git commit -m "fix(api): check auth, Host and Origin by the matched route"
```

### Task 2: Widget modal survives an equal `source`

**Files:**
- Modify: `apps/ui/app/widgets/WidgetHost.vue:50-63`
- Test: `apps/ui/test/widget-host.test.ts`

**Interfaces:**
- Consumes: `widgetModals.registerCaller(entry): () => void` (`apps/ui/app/widgets/modals.ts:66-75`).

- [ ] **Step 1: Write the failing test** in `widget-host.test.ts`, using its existing host mount and a spy on `widgetModals.registerCaller`:

```ts
it('keeps the modal caller when the source is replaced by an equal object', async () => {
  // mount a package WidgetHost with widgetId 'w1'; count registerCaller and unregister calls
  host.props.source = { kind: 'package', packageId: 'dev.test', version: '1' } // equal values, new object
  await Vue.nextTick()
  expect(unregister).not.toHaveBeenCalled()
  host.props.source = { kind: 'package', packageId: 'dev.test', version: '2' }
  await Vue.nextTick()
  expect(unregister).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: Run and see it fail**

Run: `pnpm -C apps/ui exec vitest run test/widget-host.test.ts`
Expected: FAIL — `unregister` called once after the equal replacement.

- [ ] **Step 3: Implement** — replace the array getter with a list of getters: `watch([() => props.widgetId, () => (props.source.kind === 'package' ? props.source.packageId : ''), () => (props.source.kind === 'package' ? props.source.version : ''), () => info.value?.hash], …, { immediate: true, flush: 'sync' })`. The callback body stays.

- [ ] **Step 4: Run and see it pass**: `pnpm -C apps/ui exec vitest run test/widget-host.test.ts test/widget-modal-controller.test.ts` → PASS.

- [ ] **Step 5: Commit** — `git commit -m "fix(ui): keep widget modals open when the board reloads"` (files: `WidgetHost.vue`, `widget-host.test.ts`).

### Task 3: Save conflict keeps edit mode and edits

**Files:**
- Modify: `apps/ui/app/board/space-sync.ts:118-126`
- Test: `apps/ui/test/space-sync.test.ts:369-377`

- [ ] **Step 1: Change the expectation** of the `conflict` row in `it.each(... 'after a %s save')` to `['conflict', { notice: 'The board changed in another tab. Press «Cancel» and try again' }]`, and add:

```ts
it('repeats the conflict notice on a second Done without leaving the mode', () => {
  expect(afterSave('conflict')).toEqual(afterStaySave('conflict'))
  expect(afterSave('conflict')).not.toHaveProperty('leaveMode')
  expect(afterSave('conflict')).not.toHaveProperty('reload')
})
```

- [ ] **Step 2: Run and see it fail**: `pnpm -C apps/ui exec vitest run test/space-sync.test.ts` → FAIL on the conflict row.

- [ ] **Step 3: Implement** — `case 'conflict': return afterStaySave('conflict')`; delete the old comment.

- [ ] **Step 4: Run** `pnpm -C apps/ui exec vitest run` → PASS. Check `WidgetBoard.vue` `apply()` needs no change: a reaction without `leaveMode` keeps `working` (read `apply`; if it reloads on its own, stop and report).

- [ ] **Step 5: Commit** — `git commit -m "fix(ui): keep edits after a save conflict"`.

## Phase B — hardening against malicious widgets

### Task 4: Rejected gateway calls spend the rate limit

**Files:**
- Modify: `packages/contracts/src/widget-gateway.ts:22-28,54-68`
- Modify: `apps/api/src/widget-gateway.ts:103-121,141-143,189-222`
- Test: `apps/api/test/widget-gateway.test.ts`, `packages/contracts/test/widget-gateway.test.ts`

**Interfaces:**
- Produces: `export const REJECTED_LIMIT = { max: 60, windowMs: 60_000 }` and `createRateLimiter(now: () => number): (key: string, op: GatewayOp | 'rejected') => boolean` in contracts (the SDK dev gateway keeps compiling unchanged). In the API, `rateLimit(widgetId: string, op: GatewayOp | 'rejected'): void`.

- [ ] **Step 1: Write the failing tests**

contracts: `createRateLimiter` allows 60 `'rejected'` calls per key per minute and refuses the 61st.

API (`widget-gateway.test.ts`), with the existing `openSession`/`gateway` helpers and a direct `SELECT count(*) FROM widget_audit`:

```ts
it('limits and audits invalid calls within the limit', async () => {
  const token = await openSession(PKG_WIDGET)
  const codes = []
  for (let i = 0; i < 2000; i++) codes.push(errorCode(await gateway('state.set', token, {})))
  expect(codes.filter((c) => c === 'INVALID_INPUT')).toHaveLength(60)
  expect(codes.slice(60).every((c) => c === 'RATE_LIMITED')).toBe(true)
  expect(auditRows()).toBeLessThanOrEqual(60)
})

it('limits calls with a wrong confirmation id', async () => {
  // 2000 http.send calls with header x-widget-confirmation: 'wrong' on an «Ask» grant
  // → at most 60 audit rows, the rest RATE_LIMITED
})

it('writes two rows and spends one unit for a confirmed call', async () => {
  // 428 then the approval repeat → 2 audit rows; RATE_LIMITS['http.send'].max - 1 further calls still allowed
})

it('writes one row and spends one unit for a declined confirmation', async () => {
  // 428, then the decline route → 1 audit row (CONFIRMATION_REQUIRED); RATE_LIMITS['http.send'].max - 1 further calls still allowed
})

it('audits an unknown op from the shared rejected bucket', async () => {
  // 61 calls to 'nope.op' → the 61st is RATE_LIMITED
})
```

Keep the existing test at `widget-gateway.test.ts:282` (rejections are audited).

- [ ] **Step 2: Run and see them fail**: `pnpm -C apps/api exec vitest run test/widget-gateway.test.ts` → FAIL (2000 audit rows; no `RATE_LIMITED`).

- [ ] **Step 3: Implement**
  - contracts: the limiter reads `op === 'rejected' ? REJECTED_LIMIT : RATE_LIMITS[op]`.
  - API route: when `checkGatewayCall` fails, call `rateLimit(session.widgetId, isGatewayOp(op) ? op : 'rejected')` before throwing the check error (a known op name with bad input spends from its own bucket; check whether contracts already exports an `isGatewayOp`-style guard, else use `Object.hasOwn(GATEWAY_OPS, op)`).
  - `confirmCall`: spend `rateLimit(session.widgetId, op)` before throwing `CONFIRMATION_INVALID`.
  - `finally`: skip `audit()` when `outcome === 'RATE_LIMITED'`.

- [ ] **Step 4: Run** `pnpm -C apps/api test && pnpm -C packages/contracts test && pnpm -C packages/widget-sdk test` → PASS.

- [ ] **Step 5: Commit** — `git commit -m "fix(api): rate-limit rejected gateway calls and stop auditing RATE_LIMITED"`.

### Task 5: Hourly audit purge and index

**Files:**
- Modify: `apps/api/src/widget-gateway.ts:87-88`
- Modify: `apps/api/src/migrations.ts` (append one string migration)
- Test: `apps/api/test/widget-gateway.test.ts`, `apps/api/test/db.test.ts`

- [ ] **Step 1: Write the failing tests**
  - `db.test.ts`: after `openDatabase(':memory:', …)`, `SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'widget_audit_at'` returns one row; `PRAGMA user_version` equals `MIGRATIONS.length`.
  - `widget-gateway.test.ts`: insert an audit row older than 30 days, advance the test clock and the fake timers by one hour → the row is gone; a fresh row stays.

- [ ] **Step 2: Run and see them fail**: `pnpm -C apps/api exec vitest run test/db.test.ts test/widget-gateway.test.ts` → FAIL.

- [ ] **Step 3: Implement**
  - Migration: `CREATE INDEX widget_audit_at ON widget_audit(at);`.
  - Gateway: move the purge into `purgeAudit()`, call it at registration and from `setInterval(purgeAudit, HOUR).unref()`; clear it in `app.addHook('onClose', …)` like `background-media.ts:115-117`.
  - Update any test that asserts the migration count.

- [ ] **Step 4: Run** `pnpm -C apps/api test && pnpm -C apps/api typecheck` → PASS.

- [ ] **Step 5: Commit** — `git commit -m "fix(api): purge the widget audit hourly and index it by time"`.

### Task 6: Block a widget after three user declines

**Files:**
- Modify: `apps/ui/app/confirmations.ts`
- Modify: `apps/ui/app/ConfirmDialog.vue:71-79,86,98`
- Test: `apps/ui/test/confirmations.test.ts`

**Interfaces:**
- Produces: `Confirmation.decline(): void` — a user decline (Decline button, Esc, the dialog's `cancel` event). `answer('declined')` stays for teardown and the dialog's queued `close`. Constants `DECLINES_BEFORE_BLOCK = 3`, `BLOCK_MS = 5 * 60_000`. `requestConfirmation` keeps its signature.
- Consumes: `showToast({ source, title, body })` (`apps/ui/app/toasts.ts:17`).

- [ ] **Step 1: Write the failing tests** (fake timers):

```ts
it('answers declined without a dialog after three user declines', async () => {
  for (let i = 0; i < 3; i++) { const asked = requestConfirmation(req('w1')); confirmations.value[0]!.decline(); expect(await asked).toBe('declined') }
  const fourth = requestConfirmation(req('w1'))
  expect(confirmations.value).toHaveLength(0)
  expect(await fourth).toBe('declined')
  expect(toasts.value.filter((t) => t.title.includes('blocked'))).toHaveLength(1)
})
it('does not count teardown cancels or expirations', async () => { /* 3× cancelConfirmations('w1') and 3× expiry → a 4th request is queued */ })
it('shows the dialog again after five minutes', async () => { /* block, advance 5 min → queued */ })
it('resets the count on an approval', async () => { /* decline, decline, approve, decline → still queued */ })
it('blocks only the declining widget', async () => { /* block w1 → w2 still queued */ })
```

And in the `ConfirmDialog` tests of the same file: the Decline button and Esc call `decline()`.

- [ ] **Step 2: Run and see them fail**: `pnpm -C apps/ui exec vitest run test/confirmations.test.ts` → FAIL.

- [ ] **Step 3: Implement** — per-widget state `{ declines: number; blockedUntil: number }` in a `Map`; `decline()` answers `declined`, increments, and on the third starts the block and shows the toast «Widget «title» requests are blocked for 5 minutes»; `answer('approved')` resets; a request during the block resolves `declined` at once.

- [ ] **Step 4: Run** `pnpm -C apps/ui exec vitest run && pnpm -C apps/ui typecheck` → PASS.

- [ ] **Step 5: Commit** — `git commit -m "fix(ui): stop confirmation spam after three declines"`.

### Task 7: Package identity in confirmations, toasts and modals

**Files:**
- Modify: `apps/ui/app/confirmations.ts:6-16` (`ConfirmationRequest`)
- Modify: `apps/ui/app/ConfirmDialog.vue:88`, `apps/ui/app/widgets/SandboxWidget.vue:81-82`, `apps/ui/app/widgets/WidgetHost.vue:74-75`, `apps/ui/app/widgets/WidgetModal.vue:60-63`
- Test: `apps/ui/test/confirmations.test.ts`, `apps/ui/test/widget-modal-dialog.test.ts`

**Interfaces:**
- Produces: `ConfirmationRequest.packageId?: string` and `ConfirmationRequest.version?: string` (absent for built-in widgets).
- Consumes: `ModalOwner.packageId` (already on `record.owner`).

- [ ] **Step 1: Write the failing tests**
  - Two requests with title «Weather» and `packageId` `dev.a.weather` / `dev.b.weather` render different text `dev.a.weather · 1.0.0` / `dev.b.weather · 2.0.0` under the title; a request without `packageId` renders «Built-in».
  - `WidgetModal` with an owner `packageId: 'dev.test'` renders «Third-party widget · dev.test» in the header.

- [ ] **Step 2: Run and see them fail**: `pnpm -C apps/ui exec vitest run test/confirmations.test.ts test/widget-modal-dialog.test.ts` → FAIL.

- [ ] **Step 3: Implement** — `SandboxWidget` passes `packageId: props.packageId, version: props.version` and toasts with `source: \`${props.title} · ${props.packageId}\``; `WidgetHost` (built-in) passes neither; `ConfirmDialog` adds one `<p class="confirm__source">`; `WidgetModal` replaces the source line with `Third-party widget · {{ record.owner.packageId }}` above the title.

- [ ] **Step 4: Run** `pnpm -C apps/ui exec vitest run && pnpm -C apps/ui typecheck` → PASS.

- [ ] **Step 5: Commit** — `git commit -m "fix(ui): show the package id in confirmations, toasts and modals"`.

### Task 8: Stricter plain text

**Files:**
- Modify: `packages/contracts/src/parse.ts:14-16`, `packages/contracts/src/space.ts:63-69`
- Test: `packages/contracts/test/widget-package.test.ts` (or a `parse` test next to it), `packages/contracts/test/space.test.ts`

**Interfaces:**
- Produces: `isPlainText(value: unknown, maxLength?: number): value is string` — same signature, stricter. A shared `const HIDDEN_TEXT` regex used by both checks.

- [ ] **Step 1: Write the failing tests** — `isPlainText` rejects `'   '` and each of `'\u0085'`, `'a\u200bb'`, `'a\u200eb'`, `'a\u202eb'`, `'a\u2066b'`, `'a\u2028b'`; accepts `'Weather'`, `'Météo de Paris'`, `'\u{1F468}\u200d\u{1F469}\u200d\u{1F467}'`, `'می\u200cخواهم'`. `parseSpacePatch({ title })` rejects the same hidden characters and keeps accepting the same good titles.

- [ ] **Step 2: Run and see them fail**: `pnpm -C packages/contracts exec vitest run` → FAIL.

- [ ] **Step 3: Implement** — `HIDDEN_TEXT = /[\u0080-\u009f\u200b\u200e\u200f\u202a-\u202e\u2066-\u2069\u2028\u2029]/`; `isPlainText` also requires `value.trim() !== ''`; `parseSpacePatch` rejects `HIDDEN_TEXT` on the trimmed title.

- [ ] **Step 4: Run** `pnpm -C packages/contracts test && pnpm test` (the UI and API consume these parsers) → PASS.

- [ ] **Step 5: Commit** — `git commit -m "fix(contracts): reject blank and hidden control text"`.

## Phase C — SDK, contracts, desktop

### Task 9: API exits when the desktop parent goes away

**Files:**
- Modify: `apps/api/src/server.ts:29-36`
- Test: Create `apps/api/test/server-stdin.test.ts`

**Interfaces:**
- Produces: env `LIFEDASHBOARD_EXIT_ON_STDIN_EOF=1` → shutdown on stdin end. Task 10 sets it.

- [ ] **Step 1: Write the failing test** — spawn `node apps/api/src/server.ts` with `LIFEDASHBOARD_DATA_DIR` = a temp dir, a free `LIFEDASHBOARD_API_PORT` (pick with `net.createServer().listen(0)`), `LIFEDASHBOARD_EXIT_ON_STDIN_EOF=1`, `stdio: ['pipe', 'pipe', 'pipe']`; wait for the line `LifeDashboard API listening on`; `child.stdin.end()`; expect exit code `0` within 5 s. A second case without the variable: after `stdin.end()` the process is still running after 1 s; kill it.

- [ ] **Step 2: Run and see it fail**: `pnpm -C apps/api exec vitest run test/server-stdin.test.ts` → FAIL (timeout, still running).

- [ ] **Step 3: Implement** — one `shutdown()` used by the signal handlers; when the variable is `1`, `process.stdin.once('end', shutdown).resume()`.

- [ ] **Step 4: Run** `pnpm -C apps/api test` → PASS.

- [ ] **Step 5: Commit** — `git commit -m "fix(api): exit on stdin end when the desktop asks for it"`.

### Task 10: Desktop sidecar stdin and early start errors (Rust, unverified here)

**Files:**
- Modify: `apps/desktop/src-tauri/src/main.rs:69-71,92-102`

**Interfaces:**
- Consumes: `LIFEDASHBOARD_EXIT_ON_STDIN_EOF=1` from Task 9; `tauri_plugin_dialog::{DialogExt, MessageDialogKind}` as used by `fail()` at `main.rs:182-196`.

- [ ] **Step 1: Sidecar stdin** — `.stdin(Stdio::piped())` and `.env("LIFEDASHBOARD_EXIT_ON_STDIN_EOF", "1")`. Leave `child.stdin` inside the `Child` stored in `Sidecar`: the pipe stays open while the app lives and closes when the process dies.
- [ ] **Step 2: Early start errors** — in `setup`, on `Err(error)` from `start(app.handle())`, show `app.dialog().message(format!("{error}")).title("LifeDashboard could not start").kind(MessageDialogKind::Error).blocking_show()`, then return the error.
- [ ] **Step 3: Static check** — `grep -n "Stdio::piped\|EXIT_ON_STDIN_EOF\|could not start" apps/desktop/src-tauri/src/main.rs` shows all three; no other lines changed (`git diff --stat`).
- [ ] **Step 4: Commit** — `git commit -m "fix(desktop): end the API with the app and show early start errors"`. Record in the task report: not compiled; the owner runs `cargo check` (Phase E).

### Task 11: `ld-widget build` ignores dotfiles in `assets/`

**Files:**
- Modify: `packages/widget-sdk/src/build.ts:111`
- Test: `packages/widget-sdk/test/build.test.ts`

- [ ] **Step 1: Write the failing test** — a fixture project with `assets/.DS_Store` and `assets/img/.hidden` builds; the output folder has neither file and keeps `assets/img/` real files.
- [ ] **Step 2: Run and see it fail**: `pnpm -C packages/widget-sdk exec vitest run test/build.test.ts` → FAIL with `"assets/.DS_Store" is not an allowed path`.
- [ ] **Step 3: Implement** — `copyFilter(root, (path) => !path.split(sep).some((segment) => segment.startsWith('.')))` for the `assets` copy.
- [ ] **Step 4: Run** `pnpm -C packages/widget-sdk test` → PASS (rerun `dev-server.listen.test.ts` alone if it flakes).
- [ ] **Step 5: Commit** — `git commit -m "fix(sdk): skip dotfiles in widget assets"`.

### Task 12: Contracts input fixes (modal keys, header bytes, strict new versions)

**Files:**
- Modify: `packages/contracts/src/widget-modal.ts:41-42`, `packages/contracts/src/widget-gateway.ts:177`, `packages/contracts/src/widget-package.ts:93,226`
- Test: `packages/contracts/test/widget-modal.test.ts`, `packages/contracts/test/widget-gateway.test.ts`, `packages/contracts/test/widget-package.test.ts`, `packages/contracts/test/board.test.ts`, `apps/api/test/widget-gateway.test.ts`

**Interfaces:**
- Produces: `STRICT_VERSION_PATTERN = /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/` used only in `parseWidgetManifest`; `isPackageVersion` unchanged.

- [ ] **Step 1: Write the failing tests**
  - `parseModalOpen({ view: 'v', title: undefined })` and `({ view: 'v', props: undefined })` → `ok: true` with `props: {}`; `({ view: 'v', title: '' })` → `ok: false`.
  - `http.get` input with `headers: { accept: 'text/€' }` → `INVALID_INPUT`.
  - A new manifest with version `01.0.0` or `1.00.0` → fail; `0.1.0`, `10.0.0` → ok.
  - Regressions: `parseScreenBoard` with a package source on `01.0.0` → ok; API: a widget session for an installed package row with version `01.0.0` (insert the row directly) is created.
- [ ] **Step 2: Run and see them fail**: `pnpm -C packages/contracts exec vitest run` → FAIL on the first three groups (the regressions pass already).
- [ ] **Step 3: Implement** — presence by `!== undefined`, `props ?? {}`; add `|| /[^\u0000-ÿ]/.test(value)` to the header check; `parseWidgetManifest` tests `STRICT_VERSION_PATTERN`.
- [ ] **Step 4: Run** `pnpm -C packages/contracts test && pnpm -C apps/api test && pnpm -C packages/widget-sdk test` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "fix(contracts): accept undefined modal options, reject non-Latin-1 headers and new leading-zero versions"`.

### Task 13: `create-widget` names the real reason

**Files:**
- Modify: `packages/create-widget/src/create.ts:23`
- Test: `packages/create-widget/test/create.test.ts:149`

- [ ] **Step 1: Write the failing test** — for `2048 Game` the error is `Cannot derive a Latin name from "2048 Game": it has no Latin letters or starts with a digit. Fix: give one with --slug, for example --slug my-clock.`; update the `時計` expectation at `:149` to the same wording.
- [ ] **Step 2: Run** `pnpm -C packages/create-widget exec vitest run test/create.test.ts` → FAIL.
- [ ] **Step 3: Implement** — that message text.
- [ ] **Step 4: Run** `pnpm -C packages/create-widget test` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "fix(create-widget): explain why a title has no slug"`.

## Phase D — SSRF and cleanup

### Task 14: Private-address guard for approved host names

**Files:**
- Create: `packages/contracts/src/address.ts`
- Modify: `packages/contracts/src/widget-http.ts:15-38`, `packages/contracts/package.json` (dependency + `exports` if subpaths are listed)
- Test: Create `packages/contracts/test/address.test.ts`; modify `packages/contracts/test/widget-http.test.ts`

**Interfaces:**
- Produces: `isPublicAddress(address: string): boolean` in `address.ts`; `proxyHttp(request, origins, timeoutMs?, lookup?: LookupFunction)` where `LookupFunction` is `node:net`'s lookup type, default `node:dns` `lookup`. `performHttp` keeps its signature.

- [ ] **Step 1: Add the dependency** — `pnpm -C packages/contracts add undici@8.11.2 --save-exact`; confirm `pnpm-lock.yaml` resolves 8.11.2.
- [ ] **Step 2: Write the failing tests**
  - `address.test.ts`: `false` for `127.0.0.1`, `10.1.2.3`, `172.16.0.1`, `192.168.1.1`, `169.254.169.254`, `100.64.0.1`, `0.0.0.0`, `224.0.0.1`, `::1`, `::`, `fd00::1`, `fe80::1`, `ff02::1`, `::ffff:127.0.0.1`, `::ffff:7f00:1`; `true` for `8.8.8.8`, `1.1.1.1`, `2606:4700:4700::1111`.
  - `widget-http.test.ts`, with a local HTTP server on `127.0.0.1` and an injected lookup: origin `http://api.example.test:<port>` whose lookup returns `127.0.0.1` → `GatewayFailure` `PERMISSION_DENIED`, message `api.example.test resolves to a private address`; the same name with a lookup that returns `127.0.0.1` but declared as literal `http://127.0.0.1:<port>` → 200; `http://localhost:<port>` → 200; the existing redirect test stays green.
- [ ] **Step 3: Run and see them fail**: `pnpm -C packages/contracts exec vitest run test/address.test.ts test/widget-http.test.ts` → FAIL (`address.ts` missing; private name answers 200).
- [ ] **Step 4: Implement**
  - `isPublicAddress` with `node:net` `isIP` and `BlockList` (`addSubnet` for every range above, IPv4-mapped IPv6 unwrapped to IPv4 first).
  - `proxyHttp`: `fetch` and `Agent` from `undici`. Literal IP hosts and `localhost` use an agent without a guard; other hosts use `new Agent({ connect: { lookup: guarded } })`, where `guarded` calls `lookup(host, { all: true }, …)` and fails with a `PrivateAddressError` if any address is not public. The catch maps an error whose `cause` chain holds `PrivateAddressError` to `PERMISSION_DENIED` «<host> resolves to a private address». Agents are created once per lookup function, not per request.
- [ ] **Step 5: Run** `pnpm -C packages/contracts test && pnpm -C apps/api test && pnpm -C packages/widget-sdk test && pnpm typecheck` → PASS.
- [ ] **Step 6: Commit** — `git commit -m "fix(contracts): refuse approved host names that resolve to private addresses"` (include `package.json` and `pnpm-lock.yaml`).

### Task 15: Theme contract wording and dead code

**Files:**
- Modify: `docs/theme-contract.md:4`
- Modify: `apps/ui/app/spaces/nav.ts`, `apps/ui/app/spaces/last-open.ts`, `apps/ui/test/space-nav.test.ts`, `apps/ui/test/last-open.test.ts`
- Modify: `packages/contracts/src/widget-gateway.ts:344-347`, `packages/contracts/src/widget-http.ts:31`, `apps/api/src/widget-gateway.ts:26` and its test imports, `packages/widget-sdk/src/config-declaration.ts:9`, `packages/widget-sdk/src/modal-host.ts:49` and its callers

- [ ] **Step 1: Grep before each deletion** — `grep -rn "<name>" --exclude-dir=node_modules --exclude-dir=dist .` for `headerTitle`, `screenFor`, `HelloMessage`, `RATE_LIMITS` (API re-export only), and the `fail(` callers of `modal-host.ts`. Stop and report if a non-test product reference exists.
- [ ] **Step 2: Delete** `headerTitle` and `screenFor` with their `describe` blocks; `HelloMessage`; the `RATE_LIMITS` re-export (tests import from `@lifedashboard/contracts/widget-gateway`); the quoted-name branch in `renderConfigDeclaration` (keys are validated to `^[A-Za-z][A-Za-z0-9_]{0,39}$`); the inline UTF-8 length in `proxyHttp` in favour of `byteLength` from `parse.ts`; the `_message` parameter of `fail` and the argument at its callers.
- [ ] **Step 3: Docs** — `docs/theme-contract.md` line 4: «`validateThemeCss()` in `apps/ui/app/theme/validate-theme.ts` enforces this document for the built-in themes in the test suite; a runtime check for user themes comes with user themes.»
- [ ] **Step 4: Run** `pnpm test && pnpm typecheck` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "chore: remove dead helpers and clarify where the theme contract is enforced"`.

## Phase E — acceptance

### Task 16: Acceptance

- [ ] **Step 1:** `pnpm test && pnpm typecheck` → all packages pass.
- [ ] **Step 2:** Whole-branch review on Opus 5.5 against the spec; fix accepted findings with their own failing test.
- [ ] **Step 3:** Browser check in Orca (`orca-cli` skill):
  - `http://127.0.0.1:3000/%61pi/v1/spaces` answers 401 in a fresh profile;
  - a package widget modal stays open after switching to another tab and back;
  - two tabs in edit mode: save in one, «Done» in the other → notice, still in edit mode, edits visible; «Cancel» reloads.
- [ ] **Step 4:** Report to the owner, including the request to run `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml` (or `pnpm -C apps/desktop run package`) for Task 10 before merging.
