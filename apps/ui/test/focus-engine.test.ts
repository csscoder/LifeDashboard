import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_FOCUS_SETTINGS, initialRun, type FocusRun } from '@lifedashboard/contracts/focus'
import { advance, dayKey, pause, publicStatus, reset, restore, resume, skip, start } from '../app/focus/engine'

const S = DEFAULT_FOCUS_SETTINGS
const T0 = Date.UTC(2026, 9, 29, 9)
const id = () => 'id'
const iso = (ms: number) => new Date(ms).toISOString()
const FOCUS = 1_500_000
const SHORT = 300_000
const running = (settings = S): FocusRun => start(settings, initialRun(settings), T0, id).run

describe('focus engine', () => {
  it('start sets running fields', () => {
    expect(start(S, initialRun(S), T0, id)).toEqual({
      run: { ...initialRun(S), status: 'running', endsAt: T0 + FOCUS, resumedAt: T0, seenAt: T0, phaseStartedAt: iso(T0) },
    })
  })

  it('completed focus goes to short break', () => {
    const step = advance(S, running(), T0 + FOCUS, id)
    expect(step.session).toEqual({
      id: 'id', day: dayKey(T0 + FOCUS), startedAt: iso(T0), endedAt: iso(T0 + FOCUS),
      plannedMs: FOCUS, focusMs: FOCUS, completed: true, label: null, projectId: null,
    })
    expect(step.run).toMatchObject({ phase: 'short', status: 'running', durationMs: SHORT, endsAt: T0 + FOCUS + SHORT, streak: 1 })
  })

  it('fourth pomodoro gives long break and resets streak', () => {
    const step = advance(S, { ...running(), streak: 3 }, T0 + FOCUS, id)
    expect(step.session?.completed).toBe(true)
    expect(step.run).toMatchObject({ phase: 'long', durationMs: 900_000, streak: 0 })
  })

  it('break end respects autoStartFocus', () => {
    const short = advance(S, running(), T0 + FOCUS, id).run
    const manual = advance(S, short, T0 + FOCUS + SHORT, id)
    expect(manual.session).toBeUndefined()
    expect(manual.run).toMatchObject({ phase: 'focus', status: 'ready', remainingMs: FOCUS, endsAt: null, phaseStartedAt: null })
    const auto = advance({ ...S, autoStartFocus: true }, short, T0 + FOCUS + SHORT, id)
    expect(auto.run).toMatchObject({ phase: 'focus', status: 'running', phaseStartedAt: iso(T0 + FOCUS + SHORT) })
  })

  it('auto-started focus records startedAt', () => {
    const S2 = { ...S, autoStartFocus: true }
    const short = advance(S2, running(S2), T0 + FOCUS, id).run
    const focus = advance(S2, short, T0 + FOCUS + SHORT, id).run
    const done = advance(S2, focus, T0 + FOCUS + SHORT + FOCUS, id)
    expect(done.session?.startedAt).toBe(iso(T0 + FOCUS + SHORT))
  })

  it('pause and resume accumulate focus', () => {
    const paused = pause(S, running(), T0 + 600_000, 'user', id).run
    expect(paused).toMatchObject({ status: 'paused', remainingMs: 900_000, focusedMs: 600_000, resumedAt: null, endsAt: null, pausedBy: 'user' })
    const resumed = resume(S, paused, T0 + 700_000, id).run
    expect(resumed).toMatchObject({ status: 'running', endsAt: T0 + 1_600_000, resumedAt: T0 + 700_000, seenAt: T0 + 700_000, pausedBy: null })
    const done = advance(S, resumed, T0 + 1_600_000, id)
    expect(done.session).toMatchObject({ focusMs: FOCUS, endedAt: iso(T0 + 1_600_000), startedAt: iso(T0) })
  })

  it('a hidden pause is marked hidden', () => {
    expect(pause(S, running(), T0 + 1_000, 'hidden', id).run.pausedBy).toBe('hidden')
  })

  it('skip records only after a minute', () => {
    const early = skip(S, running(), T0 + 59_999, id)
    expect(early.session).toBeUndefined()
    expect(early.run).toMatchObject({ phase: 'short', status: 'ready', remainingMs: SHORT, streak: 0 })
    const late = skip(S, running(), T0 + 60_000, id)
    expect(late.session).toMatchObject({ completed: false, focusMs: 60_000, plannedMs: FOCUS, endedAt: iso(T0 + 60_000) })
    expect(late.run).toMatchObject({ phase: 'short', status: 'ready', streak: 0 })
  })

  it('skip goes to the natural next phase without raising streak', () => {
    expect(skip(S, { ...running(), streak: 3 }, T0 + 1_000, id).run).toMatchObject({ phase: 'long', status: 'ready', streak: 0 })
    const short = advance(S, running(), T0 + FOCUS, id).run
    const skipped = skip(S, short, T0 + FOCUS + 1_000, id)
    expect(skipped.session).toBeUndefined()
    expect(skipped.run).toMatchObject({ phase: 'focus', status: 'ready', streak: 1 })
  })

  it('reset returns to full duration', () => {
    const step = reset(S, running(), T0 + 120_000, id)
    expect(step.session).toMatchObject({ completed: false, focusMs: 120_000 })
    expect(step.run).toMatchObject({
      phase: 'focus', status: 'ready', remainingMs: FOCUS, focusedMs: 0, phaseStartedAt: null, endsAt: null, resumedAt: null,
    })
  })

  it('action after deadline completes the phase once', () => {
    const at = T0 + FOCUS + 5_000
    let calls = 0
    const count = () => `id${++calls}`
    const steps = {
      pause: pause(S, running(), at, 'user', count),
      skip: skip(S, running(), at, count),
      reset: reset(S, running(), at, count),
    }
    expect(calls).toBe(3)
    for (const step of Object.values(steps)) expect(step.session).toMatchObject({ completed: true, endedAt: iso(T0 + FOCUS) })
    expect(steps.pause.run).toMatchObject({ phase: 'short', status: 'paused', remainingMs: SHORT - 5_000 })
    expect(steps.skip.run).toMatchObject({ phase: 'focus', status: 'ready' })
    expect(steps.reset.run).toMatchObject({ phase: 'short', status: 'ready', remainingMs: SHORT })
  })

  it('settings change applies to the next phase', () => {
    const step = advance({ ...S, focusMin: 50, shortBreakMin: 10 }, running(), T0 + FOCUS, id)
    expect(step.session?.plannedMs).toBe(FOCUS)
    expect(step.run.durationMs).toBe(600_000)
  })

  it('restore counts up to the heartbeat', () => {
    const restored = restore(S, { ...running(), seenAt: T0 + 600_000 }, id)
    expect(restored.session).toBeUndefined()
    expect(restored.run).toMatchObject({ status: 'paused', pausedBy: 'user', remainingMs: 900_000, focusedMs: 600_000, resumedAt: null })
    const T1 = T0 + 3_600_000
    const resumed = resume(S, restored.run, T1, id).run
    expect(skip(S, resumed, T1 + 120_000, id).session?.focusMs).toBe(720_000)
  })

  it('restore right after start', () => {
    const restored = restore(S, running(), id).run
    expect(restored).toMatchObject({ status: 'paused', focusedMs: 0, remainingMs: FOCUS })
  })

  it('restore after the deadline', () => {
    const run = { ...running(), seenAt: T0 + FOCUS + 30_000 }
    const step = restore(S, run, id)
    expect(step.session).toMatchObject({ completed: true, focusMs: FOCUS, endedAt: iso(T0 + FOCUS) })
    // Ruling 3: an auto-started break is restored too and waits for start.
    expect(step.run).toMatchObject({ phase: 'short', status: 'paused', pausedBy: 'user', remainingMs: SHORT, streak: 1 })
    expect(restore({ ...S, autoStartBreak: false }, run, id).run).toMatchObject({ phase: 'short', status: 'ready' })
  })

  it('restore leaves a run that is not running unchanged', () => {
    const run = initialRun(S)
    expect(restore(S, run, id)).toEqual({ run })
  })

  describe('dayKey', () => {
    const original = process.env.TZ
    afterEach(() => {
      if (original === undefined) delete process.env.TZ
      else process.env.TZ = original
    })

    it('dayKey uses local date of endedAt', () => {
      process.env.TZ = 'Europe/Berlin'
      expect(dayKey(Date.parse('2026-10-29T23:05:00Z'))).toBe('2026-10-30')
      process.env.TZ = 'UTC'
      expect(dayKey(Date.parse('2026-10-29T23:05:00Z'))).toBe('2026-10-29')
    })
  })

  it('publicStatus mapping', () => {
    const focus = running()
    expect(publicStatus(initialRun(S))).toEqual({ phase: 'none', running: false, endsAt: null })
    expect(publicStatus(focus)).toEqual({ phase: 'focus', running: true, endsAt: T0 + FOCUS })
    expect(publicStatus(pause(S, focus, T0 + 1_000, 'user', id).run)).toEqual({ phase: 'focus', running: false, endsAt: null })
    const short = skip(S, focus, T0 + 1_000, id).run
    expect(publicStatus(short)).toEqual({ phase: 'break', running: false, endsAt: null })
    expect(publicStatus(start(S, short, T0 + 2_000, id).run)).toEqual({ phase: 'break', running: true, endsAt: T0 + 2_000 + SHORT })
  })

  // Ruling 5: advance catches up, but one Step carries at most one session.
  describe('catch-up', () => {
    const S2 = { ...S, autoStartFocus: true }
    const second = T0 + FOCUS + SHORT + FOCUS

    it('advance stops before a second session', () => {
      const step = advance(S2, running(S2), second + 10_000, id)
      expect(step.session?.endedAt).toBe(iso(T0 + FOCUS))
      expect(step.run).toMatchObject({ phase: 'focus', status: 'running', endsAt: second, streak: 1 })
      const next = advance(S2, step.run, second + 10_000, id)
      expect(next.session).toMatchObject({ completed: true, startedAt: iso(T0 + FOCUS + SHORT), endedAt: iso(second) })
      expect(next.run).toMatchObject({ phase: 'short', status: 'running', endsAt: second + SHORT, streak: 2 })
    })

    it('catches up through a break into a ready focus', () => {
      const step = advance(S, running(), T0 + 10 * FOCUS, id)
      expect(step.session?.endedAt).toBe(iso(T0 + FOCUS))
      expect(step.run).toMatchObject({ phase: 'focus', status: 'ready', streak: 1 })
    })

    it('an action on a run still overdue returns the advance step', () => {
      const run = running(S2)
      const expected = advance(S2, run, second + 10_000, id)
      expect(skip(S2, run, second + 10_000, id)).toEqual(expected)
      expect(reset(S2, run, second + 10_000, id)).toEqual(expected)
      expect(pause(S2, run, second + 10_000, 'hidden', id)).toEqual(expected)
    })

    it('an action that would record a second session is not applied', () => {
      const run = running(S2)
      const at = T0 + FOCUS + SHORT + 120_000
      const expected = advance(S2, run, at, id)
      expect(expected.run).toMatchObject({ phase: 'focus', status: 'running' })
      expect(skip(S2, run, at, id)).toEqual(expected)
      expect(pause(S2, run, at, 'user', id).run).toMatchObject({ phase: 'focus', status: 'paused', focusedMs: 120_000 })
    })
  })

  // Ruling 6: an action in a status it does not apply to changes nothing.
  describe('inapplicable actions', () => {
    const ready = initialRun(S)
    const paused = pause(S, running(), T0 + 600_000, 'user', id).run

    it('return the run unchanged with no session', () => {
      expect(start(S, paused, T0 + 700_000, id)).toEqual({ run: paused })
      expect(resume(S, running(), T0 + 1_000, id)).toEqual({ run: running() })
      expect(resume(S, ready, T0, id)).toEqual({ run: ready })
      expect(skip(S, ready, T0, id)).toEqual({ run: ready })
      expect(reset(S, ready, T0, id)).toEqual({ run: ready })
      expect(pause(S, paused, T0 + 700_000, 'hidden', id)).toEqual({ run: paused })
      expect(pause(S, ready, T0, 'user', id)).toEqual({ run: ready })
      expect(advance(S, paused, T0 + 10 * FOCUS, id)).toEqual({ run: paused })
    })

    it('skip and reset of a paused focus end now with the focused time', () => {
      const skipped = skip(S, paused, T0 + 900_000, id)
      expect(skipped.session).toMatchObject({ completed: false, focusMs: 600_000, endedAt: iso(T0 + 900_000), day: dayKey(T0 + 900_000) })
      expect(skipped.run).toMatchObject({ phase: 'short', status: 'ready', pausedBy: null })
      const wasReset = reset(S, paused, T0 + 900_000, id)
      expect(wasReset.session).toMatchObject({ completed: false, focusMs: 600_000, endedAt: iso(T0 + 900_000) })
      expect(wasReset.run).toMatchObject({ phase: 'focus', status: 'ready', remainingMs: FOCUS, focusedMs: 0, pausedBy: null })
    })
  })
})
