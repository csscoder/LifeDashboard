import { FOCUS_LIMITS, type FocusPhase, type FocusRun, type FocusSessionInput, type FocusSettings } from '@lifedashboard/contracts/focus'

export type Step = { run: FocusRun; session?: FocusSessionInput }

const iso = (ms: number) => new Date(ms).toISOString()
const step = (run: FocusRun, session?: FocusSessionInput): Step => (session ? { run, session } : { run })

/** The zone the day follows: null for the OS time zone. */
export function focusZone(settings: FocusSettings): string | null {
  return settings.systemTime ? null : settings.zone
}

// Wall-clock parts of `epochMs` in `zone`; the OS time zone for null or a zone this browser does not know.
function wallTime(epochMs: number, zone: string | null): { year: number; month: number; day: number; h: number; m: number; s: number } {
  if (zone !== null) {
    try {
      const format = new Intl.DateTimeFormat('en-US', {
        timeZone: zone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23',
      })
      const parts = Object.fromEntries(format.formatToParts(epochMs).map(({ type, value }) => [type, Number(value)]))
      return { year: parts.year!, month: parts.month!, day: parts.day!, h: parts.hour!, m: parts.minute!, s: parts.second! }
    } catch {
      // Falls through to the OS time zone.
    }
  }
  const date = new Date(epochMs)
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(), h: date.getHours(), m: date.getMinutes(), s: date.getSeconds() }
}

export function dayKey(epochMs: number, zone: string | null = null): string {
  const { year, month, day } = wallTime(epochMs, zone)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${year}-${pad(month)}-${pad(day)}`
}

/** Hours and minutes of `iso` on the wall clock of `zone`; the OS time zone for null or a zone this browser does not know. */
export function clockTime(iso: string, zone: string | null, locale?: string): string {
  const options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }
  try {
    return new Date(iso).toLocaleTimeString(locale, zone === null ? options : { ...options, timeZone: zone })
  } catch {
    return new Date(iso).toLocaleTimeString(locale, options)
  }
}

/** Milliseconds to the next midnight on the wall clock of `zone`; off by the shift on a daylight saving day. */
export function msToMidnight(epochMs: number, zone: string | null): number {
  const { h, m, s } = wallTime(epochMs, zone)
  return 86_400_000 - ((h * 60 + m) * 60 + s) * 1000 - (((epochMs % 1000) + 1000) % 1000)
}

const phaseMs = (phase: FocusPhase, settings: FocusSettings) =>
  (phase === 'focus' ? settings.focusMin : phase === 'short' ? settings.shortBreakMin : settings.longBreakMin) * 60_000

function startRun(run: FocusRun, now: number): FocusRun {
  return {
    ...run, status: 'running', endsAt: now + run.remainingMs, resumedAt: now, seenAt: now, pausedBy: null,
    phaseStartedAt: run.phase === 'focus' ? (run.phaseStartedAt ?? iso(now)) : run.phaseStartedAt,
  }
}

function begin(run: FocusRun, phase: FocusPhase, settings: FocusSettings, autoStart: boolean, now: number): FocusRun {
  const durationMs = phaseMs(phase, settings)
  const next: FocusRun = {
    ...run, phase, status: 'ready', durationMs, endsAt: null, remainingMs: durationMs, resumedAt: null, pausedBy: null,
    phaseStartedAt: null, focusedMs: 0, seenAt: null,
  }
  return autoStart ? startRun(next, now) : next
}

// The break after a focus; `streak` is the new streak, the long-break slot follows the cycle position either way.
function afterFocus(run: FocusRun, settings: FocusSettings, streak: number, autoStart: boolean, now: number): FocusRun {
  const long = (run.streak + 1) % settings.longBreakEvery === 0
  return begin({ ...run, streak: long ? 0 : streak }, long ? 'long' : 'short', settings, autoStart, now)
}

function record(settings: FocusSettings, run: FocusRun, endedMs: number, focusMs: number, completed: boolean, newId: () => string): FocusSessionInput {
  return {
    id: newId(), day: dayKey(endedMs, focusZone(settings)), startedAt: run.phaseStartedAt ?? iso(endedMs), endedAt: iso(endedMs),
    plannedMs: run.durationMs, focusMs, completed, label: run.label, projectId: run.projectId,
  }
}

// A focus ended early is recorded only with at least a minute of focus.
function interrupted(settings: FocusSettings, run: FocusRun, now: number, newId: () => string): FocusSessionInput | undefined {
  if (run.phase !== 'focus') return undefined
  const focusMs = run.focusedMs + (run.status === 'running' && run.resumedAt !== null ? now - run.resumedAt : 0)
  return focusMs >= FOCUS_LIMITS.minRecordedMs ? record(settings, run, now, focusMs, false, newId) : undefined
}

// Deadline first: an overdue running phase ends at its endsAt before the action applies to the next running phase.
function act(settings: FocusSettings, run: FocusRun, now: number, newId: () => string, apply: (run: FocusRun) => Step): Step {
  if (run.status !== 'running') return apply(run)
  const advanced = advance(settings, run, now, newId)
  if (advanced.run === run) return apply(run)
  const next = advanced.run
  if (next.status !== 'running' || next.endsAt === null || now >= next.endsAt) return advanced
  const applied = apply(next)
  // A Step carries at most one session; the store re-runs the engine for the rest.
  if (advanced.session && applied.session) return advanced
  return step(applied.run, advanced.session ?? applied.session)
}

export function start(settings: FocusSettings, run: FocusRun, now: number, newId: () => string): Step {
  return run.status === 'ready' ? { run: startRun(run, now) } : { run }
}

export function resume(settings: FocusSettings, run: FocusRun, now: number, newId: () => string): Step {
  return run.status === 'paused' ? { run: startRun(run, now) } : { run }
}

export function pause(settings: FocusSettings, run: FocusRun, now: number, by: 'user' | 'hidden', newId: () => string): Step {
  return act(settings, run, now, newId, (current) => {
    if (current.status !== 'running' || current.endsAt === null || current.resumedAt === null) return { run: current }
    const focusedMs = current.phase === 'focus' ? current.focusedMs + now - current.resumedAt : current.focusedMs
    return { run: { ...current, status: 'paused', endsAt: null, remainingMs: current.endsAt - now, focusedMs, resumedAt: null, pausedBy: by } }
  })
}

export function skip(settings: FocusSettings, run: FocusRun, now: number, newId: () => string): Step {
  // Ruling 15: a ready phase is skipped too; it records nothing (no focused time).
  return act(settings, run, now, newId, (current) => {
    const next = current.phase === 'focus'
      ? afterFocus(current, settings, current.streak, false, now)
      : begin(current, 'focus', settings, false, now)
    return step(next, interrupted(settings, current, now, newId))
  })
}

export function reset(settings: FocusSettings, run: FocusRun, now: number, newId: () => string): Step {
  return act(settings, run, now, newId, (current) => {
    if (current.status === 'ready') return { run: current }
    const next: FocusRun = {
      ...current, status: 'ready', endsAt: null, remainingMs: current.durationMs, resumedAt: null, pausedBy: null,
      phaseStartedAt: null, focusedMs: 0, seenAt: null,
    }
    return step(next, interrupted(settings, current, now, newId))
  })
}

/** The current phase takes its length from `settings`; shortened below its elapsed time, it ends now. Same run when unchanged. */
export function retime(settings: FocusSettings, run: FocusRun, now: number): Step {
  const durationMs = phaseMs(run.phase, settings)
  const delta = durationMs - run.durationMs
  if (delta === 0) return { run }
  if (run.status === 'ready') return { run: { ...run, durationMs, remainingMs: durationMs } }
  if (run.status === 'paused') return { run: { ...run, durationMs, remainingMs: Math.max(0, run.remainingMs + delta) } }
  return { run: { ...run, durationMs, endsAt: run.endsAt === null ? null : Math.max(now, run.endsAt + delta) } }
}

export function advance(settings: FocusSettings, run: FocusRun, now: number, newId: () => string): Step {
  let session: FocusSessionInput | undefined
  while (run.status === 'running' && run.endsAt !== null && run.resumedAt !== null && now >= run.endsAt) {
    const end = run.endsAt
    if (run.phase !== 'focus') {
      run = begin(run, 'focus', settings, settings.autoStartFocus, end)
      continue
    }
    if (session) break
    session = record(settings, run, end, run.focusedMs + end - run.resumedAt, true, newId)
    run = afterFocus(run, settings, run.streak + 1, settings.autoStartBreak, end)
  }
  return step(run, session)
}

// A loaded running run waits for start; time after its last heartbeat is never counted.
export function restore(settings: FocusSettings, run: FocusRun, newId: () => string): Step {
  if (run.status !== 'running' || run.endsAt === null || run.resumedAt === null) return { run }
  const seenAt = Math.max(run.seenAt ?? run.resumedAt, run.resumedAt)
  if (seenAt >= run.endsAt) {
    const finished = advance(settings, run, run.endsAt, newId)
    return step(restore(settings, finished.run, newId).run, finished.session)
  }
  const focusedMs = run.phase === 'focus' ? run.focusedMs + seenAt - run.resumedAt : run.focusedMs
  return { run: { ...run, status: 'paused', endsAt: null, remainingMs: run.endsAt - seenAt, focusedMs, resumedAt: null, pausedBy: 'user' } }
}

export function publicStatus(run: FocusRun): { phase: 'none' | 'focus' | 'break'; running: boolean; endsAt: number | null } {
  const running = run.status === 'running'
  return {
    phase: run.phase !== 'focus' ? 'break' : run.status === 'ready' ? 'none' : 'focus',
    running,
    endsAt: running ? run.endsAt : null,
  }
}
