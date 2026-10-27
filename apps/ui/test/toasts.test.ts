import { afterEach, describe, expect, it, vi } from 'vitest'
import { showToast, toasts } from '../app/toasts'

afterEach(() => {
  vi.useRealTimers()
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
