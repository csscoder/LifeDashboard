import { describe, expect, it } from 'vitest'
import type { FocusProject, FocusSession } from '@lifedashboard/contracts/focus'
import { focusHours, lastDays, projectShares, todaySessions, weekBars } from '../app/widgets/builtin/pomodoro/stats'

function session(day: string, patch: Partial<FocusSession> = {}): FocusSession {
  return { id: `${day}-${patch.endedAt ?? ''}-${patch.projectId ?? ''}`, day, startedAt: `${day}T09:00:00.000Z`, endedAt: `${day}T09:25:00.000Z`, plannedMs: 1_500_000, focusMs: 1_500_000, completed: true, label: null, projectId: null, ...patch }
}

describe('pomodoro stats', () => {
  it('today uses local day keys', () => {
    const sessions = [session('2026-10-29', { endedAt: '2026-10-29T11:00:00.000Z' }), session('2026-10-30'), session('2026-10-29', { endedAt: '2026-10-29T10:00:00.000Z' })]
    expect(todaySessions(sessions, '2026-10-29').map(({ endedAt }) => endedAt)).toEqual(['2026-10-29T10:00:00.000Z', '2026-10-29T11:00:00.000Z'])
  })

  it('builds previous day keys across a DST change', () => {
    expect(lastDays('2026-11-02', 4)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'])
    expect(lastDays('2026-03-09', 3)).toEqual(['2026-03-07', '2026-03-08', '2026-03-09'])
    expect(lastDays('2026-03-02', 3)).toEqual(['2026-02-28', '2026-03-01', '2026-03-02'])
  })

  it('week bars: 7 entries, oldest first, zero-filled, completed only', () => {
    const sessions = [session('2026-10-29'), session('2026-10-29', { id: 'b' }), session('2026-10-29', { id: 'c', completed: false }), session('2026-10-25')]
    const bars = weekBars(sessions, '2026-10-29', 6)
    expect(bars.map(({ day }) => day)).toEqual(['2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29'])
    expect(bars.map(({ pomodoros }) => pomodoros)).toEqual([0, 0, 1, 0, 0, 0, 2])
    expect(bars.every(({ goal }) => goal === 6)).toBe(true)
  })

  it('focus hours include interrupted sessions', () => {
    const sessions = [session('2026-10-29', { focusMs: 1_500_000 }), session('2026-10-29', { focusMs: 1_500_000 }), session('2026-10-29', { focusMs: 600_000, completed: false })]
    expect(focusHours(sessions)).toBe(1.0)
  })

  it('project shares: minutes per project, No project bucket, sorted descending', () => {
    const projects: FocusProject[] = [
      { id: 'a', name: 'Alpha', color: 'blue', archivedAt: null },
      { id: 'b', name: 'Beta', color: 'green', archivedAt: null },
    ]
    const sessions = [session('2026-10-29', { projectId: 'a', focusMs: 600_000 }), session('2026-10-29', { projectId: 'b', focusMs: 1_800_000 }), session('2026-10-29', { projectId: null, focusMs: 1_200_000 }), session('2026-10-28', { projectId: 'a', focusMs: 300_000 })]
    expect(projectShares(sessions, projects)).toEqual([
      { projectId: 'b', name: 'Beta', color: 'green', minutes: 30 },
      { projectId: null, name: 'No project', color: null, minutes: 20 },
      { projectId: 'a', name: 'Alpha', color: 'blue', minutes: 15 },
    ])
  })
})
