import type { FocusPhase } from '@lifedashboard/contracts/focus'
import { showToast } from '../toasts'

type PhaseEnd = { from: FocusPhase; to: FocusPhase; nextMinutes: number }

export interface AlertDeps {
  isTauri(): boolean
  tauri: {
    isPermissionGranted(): Promise<boolean>
    requestPermission(): Promise<string>
    sendNotification(o: { title: string; body?: string }): void
  }
  web: {
    permission(): NotificationPermission | 'unsupported'
    request(): Promise<NotificationPermission>
    show(title: string): void
  }
  toast(text: string): void
  chime(): void
}

const TITLE = 'Pomodoro'

export function alertText(event: PhaseEnd): string {
  if (event.to === 'focus') return 'Break over — time to focus'
  return `Focus done — ${event.nextMinutes} min ${event.to === 'long' ? 'long break' : 'break'}`
}

export function createAlerts(deps: AlertDeps) {
  /** Permission is requested only here (the user's ▶ click), and only while undecided. */
  async function prime(): Promise<void> {
    try {
      if (deps.isTauri()) {
        if (!(await deps.tauri.isPermissionGranted())) await deps.tauri.requestPermission()
      } else if (deps.web.permission() === 'default') {
        await deps.web.request()
      }
    } catch {
      // No permission: phase ends fall back to a toast.
    }
  }

  async function notify(text: string): Promise<boolean> {
    if (deps.isTauri()) {
      if (!(await deps.tauri.isPermissionGranted())) return false
      deps.tauri.sendNotification({ title: TITLE, body: text })
      return true
    }
    if (deps.web.permission() !== 'granted') return false
    deps.web.show(text)
    return true
  }

  async function phaseEnded(event: PhaseEnd, sound: boolean): Promise<void> {
    const text = alertText(event)
    if (sound) {
      try { deps.chime() } catch { /* sound is best effort */ }
    }
    let delivered = false
    try { delivered = await notify(text) } catch { /* fall back to the toast */ }
    if (!delivered) deps.toast(text)
  }

  return { prime, phaseEnded }
}

let audio: AudioContext | undefined

/** Two sine tones (A5 then E6), about 0.6 s; silent until `prime` has created the context. */
function chime(): void {
  const ctx = audio
  if (!ctx) return
  if (ctx.state === 'suspended') void ctx.resume()
  ;[880, 1320].forEach((freq, i) => {
    const start = ctx.currentTime + i * 0.3
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3)
    osc.connect(gain).connect(ctx.destination)
    osc.start(start)
    osc.stop(start + 0.3)
  })
}

const plugin = () => import('@tauri-apps/plugin-notification')

const real = createAlerts({
  isTauri: () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window,
  tauri: {
    isPermissionGranted: async () => (await plugin()).isPermissionGranted(),
    requestPermission: async () => (await plugin()).requestPermission(),
    sendNotification: (o) => { void plugin().then((m) => m.sendNotification(o)).catch(() => showFallback(o.body ?? o.title)) },
  },
  web: {
    permission: () => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission),
    request: () => Notification.requestPermission(),
    show: (title) => { new Notification(TITLE, { body: title }) },
  },
  toast: (text) => showFallback(text),
  chime,
})

function showFallback(text: string): void {
  showToast({ source: TITLE, title: text, body: '' }, { bypassHold: true })
}

export const alerts = {
  async prime(): Promise<void> {
    audio ??= typeof AudioContext === 'undefined' ? undefined : new AudioContext()
    if (audio?.state === 'suspended') void audio.resume()
    await real.prime()
  },
  phaseEnded: real.phaseEnded,
}
