import { DEFAULT_FOCUS_SETTINGS, initialRun, type FocusRun, type FocusSessionInput } from '@lifedashboard/contracts/focus'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { call, errorCode, pair, testApp, type TestApp } from './helpers.ts'

const FOCUS = '/api/v1/focus'
let t: TestApp
let cookie: string

beforeEach(async () => {
  t = await testApp()
  cookie = await pair(t)
})

afterEach(async () => {
  await t.close()
})

const get = () => call(t.app, { url: FOCUS, cookie })
const put = (payload: unknown) => call(t.app, { method: 'PUT', url: FOCUS, cookie, payload })
const sessions = (from: string, to: string) => call(t.app, { url: `${FOCUS}/sessions?from=${from}&to=${to}`, cookie })
const run = (change: Partial<FocusRun> = {}): FocusRun => ({ ...initialRun(DEFAULT_FOCUS_SETTINGS), ...change })
const session = (id: string, change: Partial<FocusSessionInput> = {}): FocusSessionInput => ({
  id, day: '2026-10-05', startedAt: '2026-10-05T10:00:00.000Z', endedAt: '2026-10-05T10:25:00.000Z',
  plannedMs: 1_500_000, focusMs: 1_500_000, completed: true, label: null, projectId: null, ...change,
})
const createProject = (payload: unknown = { name: 'Work', color: 'blue' }) =>
  call(t.app, { method: 'POST', url: `${FOCUS}/projects`, cookie, payload })

describe('focus', () => {
  it('first read creates defaults', async () => {
    const response = await get()
    expect(response.statusCode).toBe(200)
    expect(response.json().data).toEqual({
      settings: DEFAULT_FOCUS_SETTINGS, run: initialRun(DEFAULT_FOCUS_SETTINGS), revision: 1, projects: [], recentLabels: [],
    })
  })

  it('put stores run and session in one write', async () => {
    const next = run({ status: 'paused', remainingMs: 1000, pausedBy: 'user' })
    const response = await put({ run: next, session: session('s1'), expectedRevision: 1 })
    expect(response.statusCode).toBe(200)
    expect(response.json().data).toEqual({ revision: 2 })
    expect((await get()).json().data.run).toEqual(next)
    expect((await sessions('2026-10-05', '2026-10-05')).json().data).toEqual([session('s1')])
  })

  it('failed write changes nothing', async () => {
    await get()
    t.db.exec("CREATE TRIGGER fail_focus BEFORE UPDATE ON focus BEGIN SELECT RAISE(ABORT, 'forced'); END;")
    const settings = { ...DEFAULT_FOCUS_SETTINGS, focusMin: 30 }
    const response = await put({ settings, run: run({ status: 'paused', pausedBy: 'user' }), session: session('s1'), expectedRevision: 1 })
    expect(response.statusCode).toBe(500)
    const state = (await get()).json().data
    expect(state.settings).toEqual(DEFAULT_FOCUS_SETTINGS)
    expect(state.run).toEqual(initialRun(DEFAULT_FOCUS_SETTINGS))
    expect(state.revision).toBe(1)
    expect((await sessions('2026-10-05', '2026-10-05')).json().data).toEqual([])
  })

  it('stale revision is 409', async () => {
    await get()
    expect((await put({ run: run({ streak: 1 }), expectedRevision: 1 })).statusCode).toBe(200)
    const response = await put({ run: run({ streak: 2 }), expectedRevision: 1 })
    expect(response.statusCode).toBe(409)
    expect(errorCode(response)).toBe('REVISION_CONFLICT')
    expect((await get()).json().data.run.streak).toBe(1)
  })

  it('repeated session id is ignored', async () => {
    await get()
    await put({ run: run(), session: session('s1'), expectedRevision: 1 })
    expect((await put({ run: run(), session: session('s1'), expectedRevision: 2 })).statusCode).toBe(200)
    expect((await sessions('2026-10-05', '2026-10-05')).json().data).toHaveLength(1)
  })

  it('unknown project is 400', async () => {
    await get()
    expect((await put({ run: run({ projectId: 'nope' }), expectedRevision: 1 })).statusCode).toBe(400)
    expect((await put({ run: run(), session: session('s1', { projectId: 'nope' }), expectedRevision: 1 })).statusCode).toBe(400)
    expect((await get()).json().data.revision).toBe(1)
  })

  it('invalid body is 400', async () => {
    await get()
    const response = await put({ settings: { ...DEFAULT_FOCUS_SETTINGS, focusMin: 0 }, run: run(), expectedRevision: 1 })
    expect(response.statusCode).toBe(400)
  })

  it('range limit', async () => {
    expect((await sessions('2026-01-01', '2027-01-02')).statusCode).toBe(400)
    await get()
    await put({ run: run(), session: session('b', { endedAt: '2026-10-05T12:00:00.000Z', day: '2026-10-05' }), expectedRevision: 1 })
    await put({ run: run(), session: session('a', { endedAt: '2026-10-05T11:00:00.000Z', day: '2026-10-05' }), expectedRevision: 2 })
    await put({ run: run(), session: session('c', { endedAt: '2026-11-20T11:00:00.000Z', day: '2026-11-20' }), expectedRevision: 3 })
    const response = await sessions('2026-10-01', '2026-10-30')
    expect(response.statusCode).toBe(200)
    expect(response.json().data.map((s: FocusSessionInput) => s.id)).toEqual(['a', 'b'])
  })

  it('recentLabels', async () => {
    await get()
    const labels = ['l1', 'l2', 'l3', 'l1', '', 'l4', 'l5', 'l6', 'l7', 'l8', 'l9', 'l10', 'l11', 'l12']
    let revision = 1
    for (const [i, label] of labels.entries()) {
      const endedAt = new Date(Date.parse('2026-10-05T10:00:00.000Z') + i * 60_000).toISOString()
      await put({ run: run(), session: session(`s${i}`, { label: label || null, startedAt: '2026-10-05T09:00:00.000Z', endedAt }), expectedRevision: revision++ })
    }
    // The picker shows the first 10 and searches the rest.
    expect((await get()).json().data.recentLabels).toEqual(['l12', 'l11', 'l10', 'l9', 'l8', 'l7', 'l6', 'l5', 'l4', 'l1', 'l3', 'l2'])
  })

  it('projects', async () => {
    const created = await createProject({ name: ' Work ', color: 'blue' })
    expect(created.statusCode).toBe(200)
    const project = created.json().data
    expect(project).toMatchObject({ name: 'Work', color: 'blue', archivedAt: null })
    const patched = await call(t.app, { method: 'PATCH', url: `${FOCUS}/projects/${project.id}`, cookie, payload: { archived: true } })
    expect(patched.json().data.archivedAt).toEqual(expect.any(String))
    expect((await get()).json().data.projects).toEqual([patched.json().data])
    // an archived project is still a valid reference
    expect((await put({ run: run({ projectId: project.id }), expectedRevision: 1 })).statusCode).toBe(200)
    const missing = await call(t.app, { method: 'PATCH', url: `${FOCUS}/projects/nope`, cookie, payload: { name: 'x' } })
    expect(missing.statusCode).toBe(404)
  })

  it('requires a session', async () => {
    expect((await call(t.app, { url: FOCUS })).statusCode).toBe(401)
  })
})
