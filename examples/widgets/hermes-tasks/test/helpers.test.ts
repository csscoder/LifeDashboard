import { describe, expect, it } from 'vitest'
import { addDays, formatDue, nextMonday } from '../src/dates.ts'
import { layoutFor } from '../src/layout.ts'
import { parseQuickAdd } from '../src/quick-add.ts'

const today = '2026-10-11' // a Sunday

describe('layoutFor', () => {
  it('uses the rail from 7 cells and the stacked layout below, down to the 3×4 minimum', () => {
    expect(layoutFor({ w: 7 })).toBe('rail')
    expect(layoutFor({ w: 16 })).toBe('rail')
    expect(layoutFor({ w: 6 })).toBe('stacked')
    expect(layoutFor({ w: 3 })).toBe('stacked')
  })
})

describe('dates', () => {
  it('adds days across months, years and DST changes without the machine clock', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30')
    expect(addDays('2026-10-11', -1)).toBe('2026-10-10')
  })

  it('finds the next Monday, a week ahead from a Monday', () => {
    expect(nextMonday('2026-10-11')).toBe('2026-10-12')
    expect(nextMonday('2026-10-12')).toBe('2026-10-19')
    expect(nextMonday('2026-10-17')).toBe('2026-10-19')
  })

  it('formats due dates relative to the workspace today', () => {
    expect(formatDue('2026-10-11', today)).toBe('today')
    expect(formatDue('2026-10-12', today)).toBe('tomorrow')
    expect(formatDue('2026-10-10', today)).toBe('yesterday')
    expect(formatDue('2026-10-09', today)).toBe('9 Oct')
    expect(formatDue('2027-03-18', today)).toBe('18 Mar 2027')
    expect(formatDue('2026-10-11T19:00', today)).toBe('today 19:00')
  })
})

describe('parseQuickAdd', () => {
  const context = { today, view: 'today' as const, tag: null }

  it('takes #tags and a date word out of the title', () => {
    expect(parseQuickAdd('Buy milk #home tomorrow', context)).toEqual({ title: 'Buy milk', tags: ['home'], date: '2026-10-12' })
    expect(parseQuickAdd('Call mom Today #Family', context)).toEqual({ title: 'Call mom', tags: ['family'], date: today })
  })

  it('takes the default date from the view', () => {
    expect(parseQuickAdd('Task', context)?.date).toBe(today)
    expect(parseQuickAdd('Task', { ...context, view: 'upcoming' })?.date).toBe('2026-10-12')
    expect(parseQuickAdd('Task', { ...context, view: 'inbox' })?.date).toBeNull()
    expect(parseQuickAdd('Task', { ...context, view: 'all' })?.date).toBeNull()
  })

  it('adds the selected tag once', () => {
    expect(parseQuickAdd('Movie #cinema', { ...context, tag: 'cinema' })?.tags).toEqual(['cinema'])
    expect(parseQuickAdd('Movie', { ...context, tag: 'cinema' })?.tags).toEqual(['cinema'])
  })

  it('keeps emoji and a lone #, and returns null without a title', () => {
    expect(parseQuickAdd('🎬 Movie # tonight', context)?.title).toBe('🎬 Movie # tonight')
    expect(parseQuickAdd('  #home tomorrow ', context)).toBeNull()
    expect(parseQuickAdd('', context)).toBeNull()
  })
})
