import { afterEach, describe, expect, it, vi } from 'vitest'
import { holdToasts, showToast, toasts } from '../app/toasts'

afterEach(() => {
  holdToasts(false)
  toasts.value = []
  vi.useRealTimers()
})

const push = (count: number, options?: { bypassHold?: boolean }) => {
  for (let i = 1; i <= count; i++) showToast({ source: 'W', title: String(i), body: '' }, options)
}

describe('toast hold', () => {
  it('queues held toasts', () => {
    vi.useFakeTimers()
    holdToasts(true)
    push(3)
    expect(toasts.value).toEqual([])
  })

  it('shows a bypass toast while held', () => {
    vi.useFakeTimers()
    holdToasts(true)
    showToast({ source: 'Pomodoro', title: 'saved', body: '' }, { bypassHold: true })
    expect(toasts.value.map((t) => t.title)).toEqual(['saved'])
  })

  it('flushes five and a summary', () => {
    vi.useFakeTimers()
    holdToasts(true)
    push(8)
    holdToasts(false)
    expect(toasts.value).toHaveLength(6)
    expect(toasts.value.map((t) => t.title).slice(0, 5)).toEqual(['1', '2', '3', '4', '5'])
    expect(toasts.value[5]).toMatchObject({ source: 'LifeDashboard', title: '+3 notifications while you focused', body: '' })
    vi.advanceTimersByTime(6_000)
    expect(toasts.value).toEqual([])
  })

  it('keeps the newest fifty', () => {
    vi.useFakeTimers()
    holdToasts(true)
    push(60)
    holdToasts(false)
    expect(toasts.value.map((t) => t.title).slice(0, 5)).toEqual(['11', '12', '13', '14', '15'])
    expect(toasts.value[5]!.title).toBe('+45 notifications while you focused')
  })

  it('does not flush twice or lose items on repeated hold and release', () => {
    vi.useFakeTimers()
    holdToasts(true)
    holdToasts(true)
    push(2)
    holdToasts(false)
    holdToasts(false)
    expect(toasts.value.map((t) => t.title)).toEqual(['1', '2'])
  })
})

describe('showToast', () => {
  it('shows a widget notification labeled with the widget and hides it after 6 s', () => {
    vi.useFakeTimers()
    showToast({ source: 'Hello', title: 'Reminder', body: 'Counter: 1' })
    expect(toasts.value).toEqual([{ id: expect.any(Number), source: 'Hello', title: 'Reminder', body: 'Counter: 1' }])
    vi.advanceTimersByTime(5_999)
    expect(toasts.value).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(toasts.value).toEqual([])
  })
})
