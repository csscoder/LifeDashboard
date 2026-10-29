import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import {
  DEFAULT_FOCUS_SETTINGS, initialRun, type FocusProject, type FocusPutRequest, type FocusRun, type FocusSessionInput, type FocusState,
} from '@lifedashboard/contracts/focus'
import type { SpaceColor } from '@lifedashboard/contracts/space'
import type { ApiResult } from '../app/api'
import { createFocusStore, focusNotice } from '../app/focus/store'
import { holdToasts, toasts } from '../app/toasts'

const S = DEFAULT_FOCUS_SETTINGS
const FOCUS = 1_500_000
// Local time: `today` follows the local day.
const T0 = new Date(2026, 9, 29, 9).getTime()
const iso = (ms: number) => new Date(ms).toISOString()
const unavailable = { ok: false, kind: 'unavailable' } as const
const NOT_SAVED = 'Focus progress not saved yet'
const CONFLICT = 'Focus changed in another tab; reloaded'

type Outcome = 'ok' | 'unavailable' | 'lost' | 'invalid' | Promise<void>

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

const paused = (remainingMs: number): FocusRun => ({
  ...initialRun(S), status: 'paused', pausedBy: 'user', remainingMs, focusedMs: FOCUS - remainingMs, phaseStartedAt: iso(T0 - FOCUS),
})

const session = (id: string, focusMs: number, completed: boolean, day = '2026-10-29'): FocusSessionInput => ({
  id, day, startedAt: iso(T0 - 4_000_000), endedAt: iso(T0 - 2_000_000), plannedMs: FOCUS, focusMs, completed, label: null, projectId: null,
})

// A server with the real PUT rules (revision check, insert-or-ignore sessions) and a per-call outcome queue:
// `lost` applies the write but the answer never arrives.
function fakeServer(seed: Partial<FocusState> = {}, sessions: FocusSessionInput[] = []) {
  const server = {
    settings: S, run: initialRun(S), revision: 1, projects: [] as FocusProject[], recentLabels: [] as string[], ...seed,
    sessions: new Map(sessions.map((item) => [item.id, item])),
    saves: [] as { at: number; body: FocusPutRequest }[],
    saveOutcomes: [] as Outcome[],
    focusOutcomes: [] as ('ok' | 'unavailable')[],
  }
  const api = {
    focus: vi.fn(async (): Promise<ApiResult<FocusState>> => {
      if (server.focusOutcomes.shift() === 'unavailable') return unavailable
      const { settings, run, revision, projects, recentLabels } = server
      return { ok: true, data: structuredClone({ settings, run, revision, projects, recentLabels }) }
    }),
    saveFocus: vi.fn(async (body: FocusPutRequest): Promise<ApiResult<{ revision: number }>> => {
      server.saves.push({ at: Date.now(), body: structuredClone(body) })
      const outcome = server.saveOutcomes.shift() ?? 'ok'
      if (outcome instanceof Promise) await outcome
      if (outcome === 'unavailable') return unavailable
      if (outcome === 'invalid') return { ok: false, kind: 'invalid', code: 'VALIDATION_ERROR', message: 'Unknown project' }
      if (body.expectedRevision !== server.revision) return outcome === 'lost' ? unavailable : { ok: false, kind: 'conflict' }
      if (body.settings) server.settings = body.settings
      server.run = body.run
      if (body.session && !server.sessions.has(body.session.id)) server.sessions.set(body.session.id, body.session)
      server.revision++
      return outcome === 'lost' ? unavailable : { ok: true, data: { revision: server.revision } }
    }),
    focusSessions: vi.fn(async (from: string, to: string): Promise<ApiResult<FocusSessionInput[]>> => ({
      ok: true, data: [...server.sessions.values()].filter((item) => item.day >= from && item.day <= to),
    })),
    createFocusProject: vi.fn(async (body: { name: string; color: SpaceColor }): Promise<ApiResult<FocusProject>> => ({
      ok: true, data: { id: 'p1', ...body, archivedAt: null },
    })),
    updateFocusProject: vi.fn(async (id: string, patch: { name?: string; color?: SpaceColor }): Promise<ApiResult<FocusProject>> => ({
      ok: true, data: { id, name: patch.name ?? 'Work', color: patch.color ?? 'blue', archivedAt: null },
    })),
  }
  return { server, api }
}

const cleanups: (() => void)[] = []

function setup(seed?: Partial<FocusState>, sessions?: FocusSessionInput[]) {
  const { server, api } = fakeServer(seed, sessions)
  const notice = vi.fn()
  const onPhaseEnd = vi.fn()
  let next = 0
  const scope = effectScope()
  const store = scope.run(() => createFocusStore({ api, now: () => Date.now(), newId: () => `s${++next}`, onPhaseEnd, notice }))!
  cleanups.push(() => {
    store.dispose()
    scope.stop()
  })
  return { server, api, store, notice, onPhaseEnd }
}

async function loaded(seed?: Partial<FocusState>, sessions?: FocusSessionInput[]) {
  const context = setup(seed, sessions)
  await context.store.load()
  return context
}

const flush = () => vi.advanceTimersByTimeAsync(0)
const sessionIds = (saves: { body: FocusPutRequest }[]) => saves.flatMap(({ body }) => (body.session ? [body.session.id] : []))

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T0)
})

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('focus store', () => {
  it('load restores a running run as paused', async () => {
    const run: FocusRun = {
      ...initialRun(S), status: 'running', endsAt: T0 + 1_000_000, resumedAt: T0 - 500_000, seenAt: T0 - 100_000, phaseStartedAt: iso(T0 - 500_000),
    }
    const { store } = await loaded({ run })
    expect(store.state.loaded).toBe(true)
    expect(store.state.run).toMatchObject({ status: 'paused', pausedBy: 'user', remainingMs: 1_100_000, focusedMs: 400_000 })
  })

  it('writes are serialized and coalesced', async () => {
    const { store, server, api } = await loaded()
    const gate = deferred()
    server.saveOutcomes.push(gate.promise)
    store.start()
    await vi.advanceTimersByTimeAsync(1000)
    store.pause()
    await vi.advanceTimersByTimeAsync(1000)
    store.resume()
    expect(api.saveFocus).toHaveBeenCalledTimes(1)
    gate.resolve()
    await flush()
    expect(api.saveFocus).toHaveBeenCalledTimes(2)
    expect(server.saves[1]!.body).toEqual({ run: store.state.run, expectedRevision: 2 })
  })

  it('session survives failure and conflict', async () => {
    const { store, server, notice } = await loaded({ run: paused(10_000) })
    store.resume()
    await flush()
    server.saveOutcomes.push('unavailable')
    await vi.advanceTimersByTimeAsync(10_000)
    // Another tab writes meanwhile.
    server.run = { ...initialRun(S), label: 'other tab' }
    server.revision++
    await vi.advanceTimersByTimeAsync(2000)
    const ids = sessionIds(server.saves)
    expect(ids).toHaveLength(3)
    expect(new Set(ids).size).toBe(1)
    expect(notice.mock.calls).toEqual([[NOT_SAVED], [CONFLICT]])
    expect(store.state.run.label).toBe('other tab')
    expect([...server.sessions.keys()]).toEqual(ids.slice(0, 1))
    // The unconfirmed list is empty: the next write carries no session.
    store.start()
    await flush()
    expect(server.saves.at(-1)!.body.session).toBeUndefined()
  })

  it('own landed write is not a conflict', async () => {
    const { store, server, notice } = await loaded({ run: paused(31_000) })
    store.resume()
    await flush()
    server.saveOutcomes.push('lost')
    await vi.advanceTimersByTimeAsync(30_000)
    expect(server.revision).toBe(3)
    await vi.advanceTimersByTimeAsync(1000)
    expect(store.state.run.phase).toBe('short')
    await vi.advanceTimersByTimeAsync(1000)
    const [, heartbeat, resent, completion] = server.saves
    expect(resent!.body).toEqual(heartbeat!.body)
    expect(completion!.body).toMatchObject({ expectedRevision: 3, run: store.state.run, session: { completed: true } })
    expect(server.sessions.size).toBe(1)
    expect(store.state.run.phase).toBe('short')
    expect(notice).not.toHaveBeenCalledWith(CONFLICT)
  })

  it('lost answers twice still store one session', async () => {
    const { store, server, notice } = await loaded({ run: paused(31_000) })
    store.resume()
    await flush()
    server.saveOutcomes.push('lost', 'lost')
    await vi.advanceTimersByTimeAsync(32_000)
    await vi.advanceTimersByTimeAsync(5000)
    expect(server.saves).toHaveLength(5)
    expect(server.sessions.size).toBe(1)
    expect(server.run).toEqual(store.state.run)
    expect(store.state.run.phase).toBe('short')
    expect(notice.mock.calls).toEqual([[NOT_SAVED]])
  })

  it('failed re-read after conflict keeps local state', async () => {
    const { store, server, notice } = await loaded({ run: paused(10_000) })
    store.resume()
    await flush()
    server.run = { ...initialRun(S), label: 'other tab' }
    server.revision++
    server.focusOutcomes.push('unavailable')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(store.state.run).toMatchObject({ phase: 'short', label: null })
    expect(notice.mock.calls).toEqual([[NOT_SAVED]])
    await vi.advanceTimersByTimeAsync(2000)
    expect(store.state.run.label).toBe('other tab')
    const ids = sessionIds(server.saves)
    expect(ids).toHaveLength(3)
    expect(new Set(ids).size).toBe(1)
    expect(server.sessions.size).toBe(1)
    expect(notice.mock.calls).toEqual([[NOT_SAVED], [CONFLICT]])
  })

  it('writes wait behind a pending write', async () => {
    const { store, server, api } = await loaded()
    server.saveOutcomes.push('unavailable')
    store.start()
    await flush()
    store.pause()
    await vi.advanceTimersByTimeAsync(1000)
    store.resume()
    await flush()
    expect(api.saveFocus).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(api.saveFocus).toHaveBeenCalledTimes(3)
    expect(server.saves[1]!.body).toEqual(server.saves[0]!.body)
    expect(server.saves[2]!.body).toEqual({ run: store.state.run, expectedRevision: 2 })
  })

  it('rejected write reloads', async () => {
    const { store, server, api, notice } = await loaded()
    server.saveOutcomes.push('invalid')
    store.start()
    await flush()
    expect(api.focus).toHaveBeenCalledTimes(2)
    expect(notice).toHaveBeenCalledWith('Focus change rejected: Unknown project')
    expect(store.state.run.status).toBe('ready')
    await vi.advanceTimersByTimeAsync(120_000)
    expect(api.saveFocus).toHaveBeenCalledTimes(1)
  })

  // Ruling 12: a session the server rejects can never be stored, so it must not block later writes.
  it('rejected write drops its session', async () => {
    const { store, server, notice } = await loaded({ run: paused(10_000) })
    server.saveOutcomes.push('invalid')
    // A reset focus with more than a minute of focus records a session.
    store.reset()
    await flush()
    expect(server.saves.at(-1)!.body.session).toBeDefined()
    expect(notice).toHaveBeenCalledWith('Focus change rejected: Unknown project')
    expect(store.state.run.status).toBe('paused')
    store.resume()
    await flush()
    expect(server.saves.at(-1)!.body.session).toBeUndefined()
    expect(server.sessions.size).toBe(0)
  })

  it('setTask validates', async () => {
    const project: FocusProject = { id: 'p1', name: 'Old', color: 'blue', archivedAt: iso(T0) }
    const { store } = await loaded({ projects: [project] })
    expect(store.setTask('a‮b', null)).toEqual(expect.any(String))
    expect(store.state.run.label).toBeNull()
    expect(store.setTask('x'.repeat(121), null)).toEqual(expect.any(String))
    expect(store.setTask('Write plan', 'unknown')).toEqual(expect.any(String))
    expect(store.state.run).toMatchObject({ label: null, projectId: null })
    expect(store.setTask('Write plan', 'p1')).toBeNull()
    expect(store.state.run).toMatchObject({ label: 'Write plan', projectId: 'p1' })
  })

  // Ruling 13: today's totals never silently read as zero.
  it('failed sessions request fails the load', async () => {
    const { store, api } = setup()
    api.focusSessions.mockResolvedValueOnce(unavailable)
    await store.load()
    expect(store.state).toMatchObject({ loaded: false, loadError: true })
    await store.load()
    expect(store.state).toMatchObject({ loaded: true, loadError: false })
  })

  it('saveSettings validates and reaches the server', async () => {
    const { store, server } = await loaded()
    expect(store.saveSettings({ ...S, focusMin: 0 })).toBe('focusMin must be an integer 1..120')
    expect(store.saveSettings({ ...S, focusMin: 50 })).toBeNull()
    await flush()
    expect(server.settings.focusMin).toBe(50)
    expect(store.state.run.durationMs).toBe(FOCUS)
  })

  it('project errors are returned', async () => {
    const { store, api } = await loaded()
    api.createFocusProject.mockResolvedValueOnce({ ok: false, kind: 'invalid', code: 'VALIDATION_ERROR', message: 'name must be 1..40 characters' })
    expect(await store.createProject('Work', 'blue')).toEqual({ ok: false, error: 'name must be 1..40 characters' })
    expect(await store.createProject(' ', 'blue')).toEqual({ ok: false, error: 'name must be 1..40 characters' })
    expect(api.createFocusProject).toHaveBeenCalledTimes(1)
    const created = await store.createProject('Work', 'teal')
    expect(created).toEqual({ ok: true, project: { id: 'p1', name: 'Work', color: 'teal', archivedAt: null } })
    expect(await store.updateProject('p1', { color: 'red' })).toMatchObject({ ok: true, project: { color: 'red' } })
    expect(store.state.projects).toEqual([{ id: 'p1', name: 'Work', color: 'red', archivedAt: null }])
  })

  it('stored hidden pause waits for start', async () => {
    const { store } = setup({ run: { ...paused(600_000), pausedBy: 'hidden' } })
    const leave = store.enter()
    await flush()
    expect(store.state.run).toMatchObject({ status: 'paused', pausedBy: 'user' })
    leave()
    store.enter()
    expect(store.state.run).toMatchObject({ status: 'paused', pausedBy: 'user' })
  })

  it('retries continue after the third failure', async () => {
    const { store, server, notice } = await loaded()
    server.saveOutcomes.push('unavailable', 'unavailable', 'unavailable', 'unavailable')
    store.start()
    await vi.advanceTimersByTimeAsync(82_000)
    expect(server.saves.slice(0, 5).map(({ at }) => at - T0)).toEqual([0, 2000, 7000, 22_000, 82_000])
    expect(server.revision).toBeGreaterThan(1)
    expect(notice.mock.calls).toEqual([[NOT_SAVED]])
  })

  it('presence pauses and resumes only hidden pauses', async () => {
    const { store } = await loaded()
    const leave = store.enter()
    store.start()
    leave()
    expect(store.state.run).toMatchObject({ status: 'paused', pausedBy: 'hidden' })
    const again = store.enter()
    expect(store.state.run.status).toBe('running')
    store.pause()
    again()
    store.enter()
    expect(store.state.run).toMatchObject({ status: 'paused', pausedBy: 'user' })
  })

  it('deadline timer fires advance', async () => {
    const { store, onPhaseEnd } = await loaded()
    store.start()
    await vi.advanceTimersByTimeAsync(FOCUS)
    expect(onPhaseEnd.mock.calls).toEqual([[{ from: 'focus', to: 'short', nextMinutes: 5 }]])
    expect(store.state.run).toMatchObject({ phase: 'short', status: 'running' })
    expect(store.status.value).toEqual({ phase: 'break', running: true, endsAt: T0 + FOCUS + 300_000 })
    store.skip()
    expect(onPhaseEnd).toHaveBeenCalledTimes(1)
  })

  it('heartbeat updates seenAt', async () => {
    const { store, server } = await loaded()
    store.start()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(server.saves.at(-1)!.body.run.seenAt).toBe(Date.now())
    expect(store.state.run.seenAt).toBe(T0 + 30_000)
  })

  it('recent labels update after a confirmed session', async () => {
    const labels = ['a', 'b', 'c', 'd', 'Write plan', 'e', 'f', 'g', 'h', 'i']
    const { store, api } = await loaded({ run: paused(10_000), recentLabels: labels })
    store.setTask('Write plan', null)
    store.resume()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(store.state.recentLabels).toEqual(['Write plan', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'])
    expect(api.focus).toHaveBeenCalledTimes(1)
    store.setTask(null, null)
    store.skip()
    store.start()
    await vi.advanceTimersByTimeAsync(FOCUS)
    expect(store.state.run.phase).toBe('short')
    expect(store.state.recentLabels).toEqual(['Write plan', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'])
  })

  it('today follows the local day', async () => {
    const today = [session('a', FOCUS, true), session('b', FOCUS, true), session('c', 600_000, false), session('d', FOCUS, true, '2026-10-28')]
    const first = await loaded({}, today)
    expect(first.api.focusSessions).toHaveBeenCalledWith('2026-10-29', '2026-10-29')
    expect(first.store.state.today).toEqual({ day: '2026-10-29', count: 2, focusMs: 3_600_000 })
    first.store.start()
    await vi.advanceTimersByTimeAsync(FOCUS)
    expect(first.store.state.today).toEqual({ day: '2026-10-29', count: 3, focusMs: 5_100_000 })
    await vi.advanceTimersByTimeAsync(new Date(2026, 9, 30).getTime() - Date.now() + 1000)
    expect(first.store.state.today).toEqual({ day: '2026-10-30', count: 0, focusMs: 0 })

    // A late session (ended yesterday, seen after midnight) does not count today.
    vi.setSystemTime(new Date(2026, 9, 29, 23, 30))
    const late = await loaded()
    late.store.start()
    vi.setSystemTime(new Date(2026, 9, 30, 0, 10))
    late.store.pause()
    await flush()
    expect([...late.server.sessions.values()].map(({ day }) => day)).toEqual(['2026-10-29'])
    expect(late.store.state.today).toEqual({ day: '2026-10-30', count: 0, focusMs: 0 })

    // The midnight timer has not run: a phase completing at 00:05 counts in the new day.
    vi.setSystemTime(new Date(2026, 9, 29, 23, 40))
    const overnight = await loaded()
    overnight.store.start()
    vi.setSystemTime(new Date(2026, 9, 30, 0, 6))
    overnight.store.pause()
    expect(overnight.store.state.today).toEqual({ day: '2026-10-30', count: 1, focusMs: FOCUS })
  })

  it('visibilitychange catches up; nothing is armed before load', async () => {
    const document = new EventTarget()
    const listen = vi.spyOn(document, 'addEventListener')
    vi.stubGlobal('document', document)
    const { store, onPhaseEnd } = setup()
    expect(listen).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    await store.load()
    store.start()
    // A throttled timer: the clock moves past the deadline without the timer firing.
    vi.setSystemTime(T0 + FOCUS + 1000)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(store.state.run.phase).toBe('short')
    expect(onPhaseEnd).toHaveBeenCalledTimes(1)
    store.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('focus notices', () => {
  it('store notices bypass the toast hold', () => {
    holdToasts(true)
    try {
      focusNotice('Focus progress not saved yet')
      expect(toasts.value.map((t) => t.title)).toEqual(['Focus progress not saved yet'])
    } finally {
      holdToasts(false)
      toasts.value = []
    }
  })
})
