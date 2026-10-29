import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FOCUS_SETTINGS,
  initialRun,
  parseFocusPut,
  parseFocusRun,
  parseFocusSession,
  parseFocusSettings,
  parseProjectCreate,
  parseProjectPatch,
  parseSessionRange,
} from '../src/focus.ts'

const runningRun = {
  ...initialRun(DEFAULT_FOCUS_SETTINGS),
  status: 'running',
  endsAt: 2_000_000,
  remainingMs: 1_000_000,
  resumedAt: 1_000_000,
  phaseStartedAt: '2026-10-29T10:00:00.000Z',
  seenAt: 1_000_000,
}

const session = {
  id: 's1',
  day: '2026-10-29',
  startedAt: '2026-10-29T10:00:00.000Z',
  endedAt: '2026-10-29T10:25:00.000Z',
  plannedMs: 1_500_000,
  focusMs: 1_500_000,
  completed: true,
  label: null,
  projectId: null,
}

describe('initialRun', () => {
  it('uses milliseconds', () => {
    expect(initialRun(DEFAULT_FOCUS_SETTINGS)).toEqual({
      phase: 'focus', status: 'ready', durationMs: 1_500_000, endsAt: null, remainingMs: 1_500_000,
      resumedAt: null, pausedBy: null, phaseStartedAt: null, focusedMs: 0, streak: 0, label: null, projectId: null, seenAt: null,
    })
  })
})

describe('parseFocusSettings', () => {
  it('accepts defaults', () => {
    expect(parseFocusSettings(DEFAULT_FOCUS_SETTINGS)).toEqual({ ok: true, value: DEFAULT_FOCUS_SETTINGS })
  })
  it.each([
    { focusMin: 121 }, { focusMin: 0 }, { longBreakEvery: 1 }, { dailyGoal: 25 }, { focusMin: 2.5 }, { extra: 1 }, { sound: 'yes' },
  ])('rejects %j', (patch) => {
    expect(parseFocusSettings({ ...DEFAULT_FOCUS_SETTINGS, ...patch }).ok).toBe(false)
  })
  it('rejects a non-object', () => {
    expect(parseFocusSettings(null).ok).toBe(false)
  })
})

describe('parseFocusRun', () => {
  it('accepts a valid running run', () => {
    expect(parseFocusRun(runningRun).ok).toBe(true)
  })
  it.each([
    { endsAt: null }, { resumedAt: null }, { phase: 'idle' }, { label: 'x'.repeat(121) }, { remainingMs: -1 }, { extra: 1 }, { pausedBy: 'nobody' },
  ])('rejects %j', (patch) => {
    expect(parseFocusRun({ ...runningRun, ...patch }).ok).toBe(false)
  })
})

describe('parseFocusSession', () => {
  it('accepts a valid session', () => {
    expect(parseFocusSession(session).ok).toBe(true)
  })
  it.each([
    { day: '2026-13-01' }, { focusMs: -1 }, { focusMs: 1.5 }, { plannedMs: -1 }, { plannedMs: 1.5 },
    { endedAt: '2026-10-29T09:00:00.000Z' }, { startedAt: 'yesterday' }, { label: 'x'.repeat(121) },
  ])('rejects %j', (patch) => {
    expect(parseFocusSession({ ...session, ...patch }).ok).toBe(false)
  })
})

describe('parseFocusPut', () => {
  const body = { run: runningRun, expectedRevision: 3 }
  it('accepts a body without a session', () => {
    expect(parseFocusPut(body).ok).toBe(true)
  })
  it('accepts settings and a session', () => {
    expect(parseFocusPut({ ...body, settings: DEFAULT_FOCUS_SETTINGS, session }).ok).toBe(true)
  })
  it('rejects a missing expectedRevision', () => {
    expect(parseFocusPut({ run: runningRun }).ok).toBe(false)
  })
  it('rejects an unknown key', () => {
    expect(parseFocusPut({ ...body, extra: 1 }).ok).toBe(false)
  })
  it('rejects an invalid nested run', () => {
    expect(parseFocusPut({ ...body, run: { ...runningRun, phase: 'idle' } }).ok).toBe(false)
  })
})

describe('project parsers', () => {
  it('trims the name', () => {
    expect(parseProjectCreate({ name: '  Deep work ', color: 'teal' })).toEqual({ ok: true, value: { name: 'Deep work', color: 'teal' } })
  })
  it.each([{ name: '' }, { name: 'x'.repeat(41) }, { color: 'black' }])('rejects create %j', (patch) => {
    expect(parseProjectCreate({ name: 'a', color: 'teal', ...patch }).ok).toBe(false)
  })
  it('patches only the given keys', () => {
    expect(parseProjectPatch({ archived: true })).toEqual({ ok: true, value: { archived: true } })
  })
  it('rejects an empty patch', () => {
    expect(parseProjectPatch({})).toEqual({ ok: false, error: 'nothing to change' })
  })
  it('rejects a bad patch value', () => {
    expect(parseProjectPatch({ color: 'black' }).ok).toBe(false)
    expect(parseProjectPatch({ archived: 'yes' }).ok).toBe(false)
  })
})

describe('parseSessionRange', () => {
  it('accepts 366 days', () => {
    expect(parseSessionRange('2026-01-01', '2027-01-01').ok).toBe(true)
  })
  it('rejects 367 days', () => {
    expect(parseSessionRange('2026-01-01', '2027-01-02').ok).toBe(false)
  })
  it('rejects an inverted range', () => {
    expect(parseSessionRange('2026-10-29', '2026-10-01').ok).toBe(false)
  })
  it('rejects invalid dates', () => {
    expect(parseSessionRange('2026-02-30', '2026-03-01').ok).toBe(false)
    expect(parseSessionRange(undefined, '2026-03-01').ok).toBe(false)
  })
})
