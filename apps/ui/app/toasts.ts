import { ref } from 'vue'

export interface Toast {
  id: number
  // The widget title: the user sees which widget speaks.
  source: string
  title: string
  body: string
}

const TOAST_MS = 6000
let nextId = 0

export const toasts = ref<Toast[]>([])

const MAX_HELD = 50
const MAX_FLUSHED = 5
let holding = false
let held: Omit<Toast, 'id'>[] = []

function display(message: Omit<Toast, 'id'>): void {
  const toast = { ...message, id: nextId++ }
  toasts.value = [...toasts.value, toast]
  setTimeout(() => {
    toasts.value = toasts.value.filter((item) => item.id !== toast.id)
  }, TOAST_MS)
}

/** Shows a widget notification in web mode (the Tauri notification plugin replaces it at E7). While held, it is queued unless `bypassHold`. */
export function showToast(message: Omit<Toast, 'id'>, options?: { bypassHold?: boolean }): void {
  if (!holding || options?.bypassHold) return display(message)
  held = [...held, message].slice(-MAX_HELD)
}

/** Holds toasts during a focus interval; releasing shows the first five queued and a summary of the rest. */
export function holdToasts(hold: boolean): void {
  if (hold === holding) return
  holding = hold
  if (hold) return
  const queue = held
  held = []
  queue.slice(0, MAX_FLUSHED).forEach(display)
  const rest = queue.length - MAX_FLUSHED
  if (rest > 0) display({ source: 'LifeDashboard', title: `+${rest} notifications while you focused`, body: '' })
}
