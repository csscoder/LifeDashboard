import type { FocusRun } from '@lifedashboard/contracts/focus'

export type RingTone = 'focus' | 'break' | 'goal'
export type GoalDots = { done: number; current: boolean; total: number } | { text: string }

const MAX_DOTS = 12

/** `mm:ss`, seconds rounded up so the clock reads 00:00 only when the phase ends. */
export function formatClock(ms: number): string {
  const seconds = Math.ceil(Math.max(0, ms) / 1000)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`
}

export function remainingMs(run: FocusRun, now: number): number {
  return run.status === 'running' && run.endsAt !== null ? Math.max(0, run.endsAt - now) : run.remainingMs
}

/** Elapsed share of the phase, 0…1. */
export function ringProgress(run: FocusRun, now: number): number {
  if (run.durationMs <= 0) return 0
  return Math.min(1, Math.max(0, 1 - remainingMs(run, now) / run.durationMs))
}

export function ringTone(run: FocusRun, doneToday: number, goal: number): RingTone {
  if (doneToday >= goal && !(run.phase === 'focus' && run.status === 'running')) return 'goal'
  return run.phase === 'focus' ? 'focus' : 'break'
}

export function goalDots(doneToday: number, goal: number): GoalDots {
  if (goal > MAX_DOTS) return { text: `${doneToday} / ${goal}` }
  return { done: Math.min(doneToday, goal), current: doneToday < goal, total: goal }
}

export function isCompact(size: { w: number; h: number }): boolean {
  return size.w < 5 || size.h < 5
}

export function toggleAction(run: FocusRun): 'start' | 'pause' | 'resume' {
  return run.status === 'ready' ? 'start' : run.status === 'running' ? 'pause' : 'resume'
}

export function formatTotal(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  const hours = Math.floor(minutes / 60)
  return hours ? `${hours} h ${minutes % 60} min` : `${minutes} min`
}
