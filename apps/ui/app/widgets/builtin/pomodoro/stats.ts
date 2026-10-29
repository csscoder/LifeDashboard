import type { FocusProject, FocusSession } from '@lifedashboard/contracts/focus'
import type { SpaceColor } from '@lifedashboard/contracts/space'

export interface DayBar { day: string; pomodoros: number; goal: number }
export interface ProjectShare { projectId: string | null; name: string; color: SpaceColor | null; minutes: number }

/** The `count` local day keys ending at `today`, oldest first. Calendar arithmetic, so a 23 or 25 hour day cannot skip or repeat a key. */
export function lastDays(today: string, count: number): string[] {
  const [year = 0, month = 1, date = 1] = today.split('-').map(Number)
  const pad = (value: number) => String(value).padStart(2, '0')
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(year, month - 1, date - (count - 1 - index))
    return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`
  })
}

export function todaySessions(sessions: FocusSession[], today: string): FocusSession[] {
  return sessions.filter(({ day }) => day === today).sort((a, b) => Date.parse(a.endedAt) - Date.parse(b.endedAt))
}

export function weekBars(sessions: FocusSession[], today: string, goal: number): DayBar[] {
  return lastDays(today, 7).map((day) => ({ day, pomodoros: sessions.filter((item) => item.day === day && item.completed).length, goal }))
}

export function focusHours(sessions: FocusSession[]): number {
  return Math.round(sessions.reduce((sum, { focusMs }) => sum + focusMs, 0) / 360_000) / 10
}

export function projectShares(sessions: FocusSession[], projects: FocusProject[]): ProjectShare[] {
  const ms = new Map<string | null, number>()
  for (const { projectId, focusMs } of sessions) ms.set(projectId, (ms.get(projectId) ?? 0) + focusMs)
  return [...ms]
    .map(([projectId, total]) => {
      const project = projects.find(({ id }) => id === projectId)
      return { projectId, name: project?.name ?? 'No project', color: project?.color ?? null, minutes: Math.round(total / 60_000) }
    })
    .sort((a, b) => b.minutes - a.minutes)
}
