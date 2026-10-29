import { describe, expect, it } from 'vitest'
import { DEFAULT_FOCUS_SETTINGS, initialRun, type FocusRun } from '@lifedashboard/contracts/focus'
import { formatClock, formatTotal, goalDots, isCompact, ringProgress, ringTone, toggleAction } from '../app/widgets/builtin/pomodoro/view'

const T0 = Date.UTC(2026, 9, 29, 9)
const FOCUS = 1_500_000
const ready = initialRun(DEFAULT_FOCUS_SETTINGS)
const running: FocusRun = { ...ready, status: 'running', endsAt: T0 + FOCUS, resumedAt: T0, seenAt: T0 }
const paused: FocusRun = { ...ready, status: 'paused', remainingMs: FOCUS / 4, pausedBy: 'user' }
const shortBreak: FocusRun = { ...ready, phase: 'short', durationMs: 300_000, remainingMs: 300_000 }

describe('pomodoro view', () => {
  it('formats the clock as mm:ss with seconds rounded up', () => {
    expect(formatClock(1_500_000)).toBe('25:00')
    expect(formatClock(59_001)).toBe('01:00')
    expect(formatClock(0)).toBe('00:00')
  })

  it('measures ring progress from endsAt while running and from remainingMs otherwise', () => {
    expect(ringProgress(running, T0 + FOCUS / 2)).toBe(0.5)
    expect(ringProgress(paused, T0)).toBe(0.75)
    expect(ringProgress(ready, T0)).toBe(0)
  })

  it('tones the ring gold once the goal is met, except during a running focus', () => {
    expect(ringTone(ready, 8, 8)).toBe('goal')
    expect(ringTone(shortBreak, 8, 8)).toBe('goal')
    expect(ringTone(running, 8, 8)).toBe('focus')
    expect(ringTone(shortBreak, 2, 8)).toBe('break')
    expect(ringTone({ ...shortBreak, phase: 'long' }, 2, 8)).toBe('break')
    expect(ringTone(running, 2, 8)).toBe('focus')
  })

  it('shows dots up to a goal of 12 and a count above it', () => {
    expect(goalDots(4, 8)).toEqual({ done: 4, current: true, total: 8 })
    expect(goalDots(5, 16)).toEqual({ text: '5 / 16' })
  })

  it('uses the compact layout below 5 cells', () => {
    expect(isCompact({ w: 4, h: 6 })).toBe(true)
    expect(isCompact({ w: 6, h: 4 })).toBe(true)
    expect(isCompact({ w: 6, h: 6 })).toBe(false)
  })

  it('maps the run status to the toggle action', () => {
    expect(toggleAction(ready)).toBe('start')
    expect(toggleAction(running)).toBe('pause')
    expect(toggleAction(paused)).toBe('resume')
  })

  it('formats the focus total in hours and minutes', () => {
    expect(formatTotal(12_000_000)).toBe('3 h 20 min')
    expect(formatTotal(2_700_000)).toBe('45 min')
  })
})
