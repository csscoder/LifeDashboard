# Audit fixes — design

Date: 2026-10-27. Branch: `fix/audit-findings` (from `feat/clock-timezone-english-ui`).

## Goal

Close the 18 findings of the 2026-10-27 repository audit, in order of risk: the authentication bypass and lost user data first, then hardening against malicious widget packages, then SDK, contracts and desktop correctness, then the SSRF gap and dead code.

Expected load stays the same: one person on their own computer, a few tabs, third-party widget packages that may be malicious.

## Success criteria

- Every fix lands with a test that fails before the change (RED → GREEN → REFACTOR). Rust changes are the exception, see «Constraints».
- `pnpm test` and `pnpm typecheck` pass at the end of every phase.
- No behavior change outside the findings, except the ones listed here.
- Stored data stays valid: installed manifests and saved titles are not re-validated by the stricter rules.

## Constraints

- One new dependency, approved for finding 7: `undici` 8.11.2, exact version, in `packages/contracts`. It is already in the lockfile as a transitive dependency.
- `cargo` is not installed in this environment. The Rust changes for findings 8 and 16 cannot be compiled here; the owner runs `cargo check` or `pnpm -C apps/desktop run package` before merging.
- Commits go to `fix/audit-findings`, never to `main`.
- Subagent models follow `CLAUDE.local.md`: Haiku 5.5 implements, Sonnet 5.5 reviews, Opus 5.5 does the final whole-branch review.

## External facts checked

- `undici` 8.11.2 `Agent` accepts `connect` options of type `TcpNetConnectOpts`, which include `lookup`; the address check therefore runs in the same DNS resolution that opens the socket (`node_modules/.pnpm/undici@8.11.2/node_modules/undici/types/connector.d.ts`, checked 2026-10-27).
- Node 24 bundles undici 7.30.1 (`process.versions.undici`). Passing an npm `undici@8` `Agent` to the global `fetch` crosses major versions; for a security boundary use `fetch` from the same `undici@8` package as the `Agent` (Perplexity search, sonar, 2026-10-27; consistent with the installed types).
- Fastify 5.12.5 exposes `request.routeOptions.url`, the pattern of the matched route (`fastify/types/request.d.ts:103`).
- `performHttp` (`packages/contracts/src/widget-http.ts`) is imported only by `apps/api/src/widget-gateway.ts` and `packages/widget-sdk/src/dev/gateway.ts`, both Node; the UI bundle does not load it.
- Stored manifests are read with `JSON.parse` only (`apps/api/src/sandbox.ts:62`, `widget-packages.ts:71,115`); only uploads run `parseWidgetManifest` (`widget-uploads.ts:155`).

## Phase A — critical

### A1. Authentication bypass through an encoded path (finding 1)

Today `apps/api/src/auth.ts:105-110` decides by the raw `request.url`, while the router decodes the path, so `GET /%61pi/v1/spaces` skips the session, Host and Origin checks. `apps/api/src/sandbox.ts:66` has the same flaw for the sandbox Host check, and `UPLOAD_FILE_PATH` (`auth.ts:29`) matches the raw path too.

Design:
- Both `onRequest` hooks read `request.routeOptions.url` (the matched route pattern). The auth hook applies when it starts with `/api/`; the sandbox hook when it starts with `/sandbox/`.
- `PUBLIC_PATHS` and the upload exemption compare against the route pattern, not the raw URL.
- A request without a matched route has no `routeOptions.url`; Fastify answers 404 and no handler runs.

Tests (`apps/api/test/auth.test.ts`, sandbox test):
- `GET /%61pi/v1/spaces` without a session → 401.
- `POST /%61pi/v1/spaces` with `Host: evil.example:3001` → 403.
- `GET /%73andbox/runtime/<file>` with a foreign Host → 403.
- The public pairing routes still work through their normal path.

### A2. Widget modal closes when the tab becomes visible (finding 2)

`apps/ui/app/widgets/WidgetHost.vue:50-63` watches a getter that returns a new array, so the callback runs whenever `props.source` is replaced, even with equal values; its cleanup calls `controller.removeCaller`, which cancels the open modal. `WidgetBoard.vue` reloads the board on `visibilitychange`, which replaces every `source`.

Design: watch a list of getters, `watch([() => props.widgetId, () => packageId, () => version, () => info.value?.hash], …)`, so Vue compares each value.

Test: replacing `source` with an equal object does not call `removeCaller`; changing `version` still does.

### A3. Save conflict on «Done» (finding 3)

`afterSave('conflict')` (`apps/ui/app/board/space-sync.ts:118-126`) leaves edit mode and reloads, which drops the user's edits, while the notice says «Press «Cancel» and try again».

Design: `afterSave('conflict')` returns `afterStaySave('conflict')`: edit mode and the working copy stay, the notice is true, and «Cancel» reloads the board from the server. The other tab's save is still protected by the revision check.

Test: `apps/ui/test/space-sync.test.ts` expects `{ notice }` without `leaveMode` and `reload` for a conflicting save.

## Phase B — hardening against malicious widgets

### B4. Rejected gateway calls are not rate-limited (finding 4)

In `apps/api/src/widget-gateway.ts:189-222`, a call rejected by `checkGatewayCall` never reaches `rateLimit`, and `finally` writes an audit row for every call, `RATE_LIMITED` ones included. The audit purge runs only at startup (`:88`) and `widget_audit` has no index on `at`.

Design:
- A call rejected by `checkGatewayCall` spends one unit of its operation's limit; an unknown operation spends from a shared `rejected` bucket of 60 calls per minute. The rate-limiter key widens from `GatewayOp` to `GatewayOp | 'rejected'`.
- A call rejected by `confirmCall` with `CONFIRMATION_INVALID` (a confirmation header that does not match the pending confirmation) also spends one unit of its operation's limit. Today it throws before any limit is spent (`widget-gateway.ts:107-109`).
- Calls whose outcome is `RATE_LIMITED` write no audit row. Every other audited outcome has spent a limit unit, except the single-use approval repeat that completes a confirmation (its unit was spent when the confirmation was issued). A confirmed call therefore writes two rows, `CONFIRMATION_REQUIRED` and its result, so audit rows per widget per minute are bounded by twice the sum of the limits.
- The audit purge also runs hourly from an `unref()` timer, as in `background-media.ts:115`.
- A new migration adds `CREATE INDEX widget_audit_at ON widget_audit(at)`.

Tests:
- 2000 invalid calls write at most 60 audit rows; the rest answer `RATE_LIMITED`.
- 2000 calls with a wrong confirmation id write at most 60 audit rows; the rest answer `RATE_LIMITED`.
- A full confirmation cycle (428, then the approval repeat) writes two rows and spends one unit; a declined confirmation writes the `CONFIRMATION_REQUIRED` row and spends one unit.
- The purge removes old rows after the timer fires (fake timers).
- The migration creates the index.
- `widget-gateway.test.ts:282` keeps asserting that rejected calls are audited, within the limit.

### B5. Confirmation dialog spam (finding 5)

After «Decline» a widget can repeat the call at once; for `http.send` that is up to 60 modal dialogs a minute, and the page under the modal is inert.

Design (`apps/ui/app/confirmations.ts`):
- Only user declines count: the Decline button and Esc in the dialog. Teardown cancels (`cancelConfirmations`, `cancelSurfaceConfirmations`, which today also answer `declined`) and expired dialogs do not count. The confirmation entry therefore records whether a `declined` answer came from the user.
- After 3 user declines in a row from one `widgetId`, further requests from that widget answer `declined` for 5 minutes without entering the queue.
- One toast at the start of the block: «Widget «title» requests are blocked for 5 minutes».
- An approval resets the counter; so does the end of the block.

Tests: three user declines → the fourth request resolves `declined` and the queue stays empty; three teardown cancels or expirations do not start a block; after 5 minutes (fake timers) the dialog shows again; an approval resets the count; the toast appears once per block.

### B6. Confirmation shows only the widget title (finding 6)

`ConfirmDialog.vue:88` names the caller by `manifest.title`, which another package can copy.

Design:
- `ConfirmationRequest` gains `packageId` and `version` (absent for built-in widgets). `ConfirmDialog` shows `packageId · version` in small text under the title, or «Built-in».
- Toasts from package widgets use the source `title · packageId`.

Test: two widgets with the same title produce dialogs with different package lines; a built-in widget shows «Built-in».

### B11. Third-party label in widget modals (finding 11)

A widget can open a full-screen modal at load and draw a fake host form inside it.

Design: the host-drawn modal header (`apps/ui/app/widgets/WidgetModal.vue`) always shows «Third-party widget · packageId». It sits outside the iframe, so the widget cannot hide or cover it. No gesture requirement.

Test: an open package modal renders the label with its `packageId`.

### B13. Plain-text check lets invisible text through (finding 13)

`isPlainText` (`packages/contracts/src/parse.ts:14-16`) blocks only C0 controls and DEL; the space title check (`space.ts:63-69`) checks the trimmed length only.

Design: `isPlainText` and the space title check also reject whitespace-only text, C1 controls `\u0080-\u009f`, zero-width and direction marks `​-‏`, direction embeddings and overrides `‪-‮`, isolates `⁦-⁩`, and line/paragraph separators ` - `. The rule applies to new input only (uploads, API requests); stored data is not re-validated.

Tests: one case per character class for `isPlainText` and for the space title; an ordinary title with spaces and non-ASCII letters still passes.

## Phase C — SDK, contracts, desktop

### C8. Orphaned API process after a desktop crash (finding 8)

`main.rs` stops the sidecar only on a normal exit; after Force Quit or a crash `node` keeps port 3101 and the next launch fails.

Design:
- `apps/desktop/src-tauri/src/main.rs` spawns the API with `Stdio::piped()` stdin, keeps the handle in the sidecar state, and sets `LIFEDASHBOARD_EXIT_ON_STDIN_EOF=1`.
- `apps/api/src/server.ts` runs the existing shutdown when stdin ends, only if that variable is `1`. Without it nothing changes, so `pnpm dev` is not affected.

Test (`apps/api`): spawn the server with the variable and a temporary data dir, close stdin → the process exits with code 0. The Rust side is unverified here.

### C9. `ld-widget build` fails on `assets/.DS_Store` (finding 9)

`packages/widget-sdk/src/build.ts:111` copies `assets/` without a filter. Design: skip any path segment that starts with a dot. Test: a project with `assets/.DS_Store` builds, and the package has no such file.

### C10. `modal.open` rejects `title: undefined` (finding 10)

`packages/contracts/src/widget-modal.ts:41-42` uses `Object.hasOwn`. Design: treat a key as present only when its value is not `undefined`; `props` falls back to `{}`. Test: `{ view, title: undefined }` and `{ view, props: undefined }` are accepted; `{ view, title: '' }` is still rejected.

### C12. Non-Latin-1 header values look like an unreachable service (finding 12)

`parseHttpHeaders` (`packages/contracts/src/widget-gateway.ts:177`) passes `accept: 'text/€'`, then `fetch` throws and the error maps to `UPSTREAM_ERROR`. Design: reject values with characters above `ÿ` as `INVALID_INPUT`, like `secretValueError`. Test: that header gives `INVALID_INPUT`.

### C14. Package versions with leading zeros (finding 14)

`packages/contracts/src/widget-package.ts:93` accepts `01.0.0`, which compares equal to `1.0.0`.

Design:
- The strict format `^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$` applies only where a new manifest is parsed (`parseWidgetManifest`, `widget-package.ts:226`).
- `isPackageVersion` keeps the current permissive format. It validates references to installed versions: board sources (`board.ts:175`, `parseWidgetSource`), widget-session creation (`apps/api/src/widget-gateway.ts:160`) and version switching. A version installed before this change, such as `01.0.0`, keeps working.

Tests: a new manifest with `01.0.0` or `1.00.0` is rejected, `0.1.0` and `10.0.0` pass; a board with a source on an installed `01.0.0` still saves; a widget session for it is still created.

### C15. `create-widget` gives the wrong reason (finding 15)

`packages/create-widget` says «Cannot derive a Latin name» for `2048 Game`, whose slug starts with a digit. Design: the message reads «…has no Latin letters or starts with a digit». Slug rules stay. Test: the error text for `2048 Game`.

### C16. Early desktop start errors are invisible (finding 16)

If `start()` in `main.rs` fails (no `node` binary, unwritable data dir), the app exits without a dialog. Design: on `Err` from `start()` show a `MessageDialogKind::Error` dialog with the reason, then exit. Unverified here (no `cargo`).

## Phase D — SSRF and cleanup

### D7. Approved host names may resolve to private addresses (finding 7)

`performHttp` compares origins as strings and then lets `fetch` resolve DNS freely.

Design (`packages/contracts/src/widget-http.ts`):
- `performHttp` uses `fetch` and `Agent` from `undici` 8.11.2 with a `connect.lookup` that resolves all addresses and rejects the connection when any of them is not public.
- Not public: loopback (`127.0.0.0/8`, `::1`), private (`10/8`, `172.16/12`, `192.168/16`, `fc00::/7`), link-local (`169.254/16`, `fe80::/10`), CGNAT (`100.64/10`), multicast, unspecified (`0.0.0.0/8`, `::`), and IPv4-mapped IPv6 of any of these.
- The rule applies to host **names**. An origin whose host is an IP literal or `localhost` is allowed as declared: the user saw it in the install dialog, and local development against a mock server keeps working.
- A blocked connection maps to `PERMISSION_DENIED` with the message «<host> resolves to a private address».
- Redirects stay unfollowed.

Tests:
- A pure `isPublicAddress(ip)` function covers every range above, IPv4 and IPv6, plus mapped IPv4.
- `performHttp` with an injected lookup: a name resolving to `127.0.0.1` is rejected; a name resolving to a public address passes; the literal `127.0.0.1` origin passes; `localhost` passes.
- The existing redirect test still passes.

### D17. Remove the unused theme validator (finding 17)

`apps/ui/app/theme/validate-theme.ts` (259 lines) runs only in `apps/ui/test/theme-contract.test.ts`; `postcss` in `apps/ui/package.json` exists for it.

Design:
- Delete `validate-theme.ts` and its tests; keep the token-contract tests in `theme-contract.test.ts`.
- Remove `postcss` from `apps/ui/package.json` after checking that no Nuxt or UnoCSS config needs it as a direct dependency.
- `docs/theme-contract.md`: replace the statement that `validateThemeCss()` enforces the document (line 4) with one saying that no validator runs today and that CSS validation returns together with user themes; mark the validator sections («Contrast» procedure, «Error messages») as requirements for that future validator, not current behavior.

### D18. Dead code (finding 18)

Delete, after a whole-tree grep that includes tests, templates and docs:
- `headerTitle` (`apps/ui/app/spaces/nav.ts`) and `screenFor` (`apps/ui/app/spaces/last-open.ts`) with their tests;
- `HelloMessage` (`packages/contracts/src/widget-gateway.ts:344-347`);
- the `RATE_LIMITS` re-export in `apps/api/src/widget-gateway.ts:26` (tests import it from contracts);
- the unreachable quoted-name branch in `packages/widget-sdk/src/config-declaration.ts:9`;
- the duplicate `byteLength` in `widget-http.ts:31` (use the one in `parse.ts`);
- the unused `_message` parameter of `fail` in `packages/widget-sdk/src/modal-host.ts:49`.

## Phase E — acceptance

- Final whole-branch review on Opus 5.5.
- `pnpm test` and `pnpm typecheck`.
- Browser check in Orca: pairing and sign-in; a widget modal survives switching tabs; a conflict between two tabs keeps the edits.
- The owner runs `cargo check` (or the desktop package build) for findings 8 and 16.

## Out of scope

Findings the audit left out as minor: inconsistent input locks during a space switch (the server rejects foreign screens), the desktop log truncated by a second launch, and the single-instance guard (it needs a new Tauri plugin).
