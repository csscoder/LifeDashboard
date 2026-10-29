import { FOCUS_LIMITS, type FocusPhase, type FocusRun, type FocusSessionInput, type FocusSettings } from '@lifedashboard/contracts/focus'

export type Step = { run: FocusRun; session?: FocusSessionInput }

const iso = (ms: number) => new Date(ms).toISOString()
const step = (run: FocusRun, session?: FocusSessionInput): Step => (session ? { run, session } : { run })

export function dayKey(epochMs: number): string {
  const date = new Date(epochMs)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function startRun(run: FocusRun, now: number): FocusRun {
  return {
    ...run, status: 'running', endsAt: now + run.remainingMs, resumedAt: now, seenAt: now, pausedBy: null,
    phaseStartedAt: run.phase === 'focus' ? (run.phaseStartedAt ?? iso(now)) : run.phaseStartedAt,
  }
}

function begin(run: FocusRun, phase: FocusPhase, settings: FocusSettings, autoStart: boolean, now: number): FocusRun {
  const minutes = phase === 'focus' ? settings.focusMin : phase === 'short' ? settings.shortBreakMin : settings.longBreakMin
  const durationMs = minutes * 60_000
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

function record(run: FocusRun, endedMs: number, focusMs: number, completed: boolean, newId: () => string): FocusSessionInput {
  return {
    id: newId(), day: dayKey(endedMs), startedAt: run.phaseStartedAt ?? iso(endedMs), endedAt: iso(endedMs),
    plannedMs: run.durationMs, focusMs, completed, label: run.label, projectId: run.projectId,
  }
}

// A focus ended early is recorded only with at least a minute of focus.
function interrupted(run: FocusRun, now: number, newId: () => string): FocusSessionInput | undefined {
  if (run.phase !== 'focus') return undefined
  const focusMs = run.focusedMs + (run.status === 'running' && run.resumedAt !== null ? now - run.resumedAt : 0)
  return focusMs >= FOCUS_LIMITS.minRecordedMs ? record(run, now, focusMs, false, newId) : undefined
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
    return step(next, interrupted(current, now, newId))
  })
}

export function reset(settings: FocusSettings, run: FocusRun, now: number, newId: () => string): Step {
  return act(settings, run, now, newId, (current) => {
    if (current.status === 'ready') return { run: current }
    const next: FocusRun = {
      ...current, status: 'ready', endsAt: null, remainingMs: current.durationMs, resumedAt: null, pausedBy: null,
      phaseStartedAt: null, focusedMs: 0, seenAt: null,
    }
    return step(next, interrupted(current, now, newId))
  })
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
    session = record(run, end, run.focusedMs + end - run.resumedAt, true, newId)
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
