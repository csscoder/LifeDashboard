import { describe, expect, it, vi } from 'vitest'
import { alertText, createAlerts } from '../app/focus/alerts'

const focusEnd = { from: 'focus', to: 'short', nextMinutes: 10 } as const

function setup(over: { isTauri?: boolean; tauriGranted?: boolean; web?: NotificationPermission | 'unsupported' } = {}) {
  const deps = {
    isTauri: () => over.isTauri ?? false,
    tauri: {
      isPermissionGranted: vi.fn(async () => over.tauriGranted ?? true),
      requestPermission: vi.fn(async () => 'granted'),
      sendNotification: vi.fn(),
    },
    web: {
      permission: vi.fn(() => over.web ?? 'granted'),
      request: vi.fn(async () => 'granted' as NotificationPermission),
      show: vi.fn(),
    },
    toast: vi.fn(),
    chime: vi.fn(),
  }
  return { deps, alerts: createAlerts(deps) }
}

describe('alerts', () => {
  it('texts use the actual length', () => {
    expect(alertText(focusEnd)).toBe('Focus done — 10 min break')
    expect(alertText({ from: 'focus', to: 'long', nextMinutes: 20 })).toBe('Focus done — 20 min long break')
    expect(alertText({ from: 'short', to: 'focus', nextMinutes: 25 })).toBe('Break over — time to focus')
  })

  it('desktop uses the plugin', async () => {
    const { deps, alerts } = setup({ isTauri: true })
    await alerts.phaseEnded(focusEnd, true)
    expect(deps.tauri.sendNotification).toHaveBeenCalledWith({ title: 'Pomodoro', body: 'Focus done — 10 min break' })
    expect(deps.toast).not.toHaveBeenCalled()
  })

  it('browser uses Notification', async () => {
    const { deps, alerts } = setup()
    await alerts.phaseEnded(focusEnd, true)
    expect(deps.web.show).toHaveBeenCalledWith('Focus done — 10 min break')
    expect(deps.toast).not.toHaveBeenCalled()
  })

  it('denied falls back to a toast', async () => {
    const { deps, alerts } = setup({ web: 'denied' })
    await alerts.phaseEnded(focusEnd, true)
    expect(deps.toast).toHaveBeenCalledWith('Focus done — 10 min break')
    expect(deps.web.show).not.toHaveBeenCalled()
  })

  it('undecided permission falls back to a toast without asking', async () => {
    const { deps, alerts } = setup({ web: 'default' })
    await alerts.phaseEnded(focusEnd, true)
    expect(deps.web.request).not.toHaveBeenCalled()
    expect(deps.toast).toHaveBeenCalled()
  })

  it('a throwing plugin falls back to a toast', async () => {
    const { deps, alerts } = setup({ isTauri: true })
    deps.tauri.sendNotification.mockImplementation(() => { throw new Error('boom') })
    await expect(alerts.phaseEnded(focusEnd, true)).resolves.toBeUndefined()
    expect(deps.toast).toHaveBeenCalledWith('Focus done — 10 min break')
  })

  it('sound follows the setting', async () => {
    const { deps, alerts } = setup()
    await alerts.phaseEnded(focusEnd, false)
    expect(deps.chime).not.toHaveBeenCalled()
    await alerts.phaseEnded(focusEnd, true)
    expect(deps.chime).toHaveBeenCalledTimes(1)
  })

  it('prime requests permission only when undecided, and repeatedly is safe', async () => {
    const undecided = setup({ web: 'default' })
    await undecided.alerts.prime()
    expect(undecided.deps.web.request).toHaveBeenCalledTimes(1)
    const decided = setup({ web: 'granted' })
    await decided.alerts.prime()
    await decided.alerts.prime()
    expect(decided.deps.web.request).not.toHaveBeenCalled()
    const desktop = setup({ isTauri: true, tauriGranted: false })
    await desktop.alerts.prime()
    expect(desktop.deps.tauri.requestPermission).toHaveBeenCalledTimes(1)
  })
})
