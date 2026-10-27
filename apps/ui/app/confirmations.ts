import { ref } from 'vue'
import { showToast } from './toasts'
import { CONFIRMATION_DIALOG_MS, type GatewayOp } from '@lifedashboard/contracts/widget-gateway'

export type ConfirmationAnswer = 'approved' | 'declined' | 'expired'

export interface ConfirmationRequest {
  // Keys the entry: two instances of one package share a title.
  widgetId: string
  ownerId?: string
  returnFocus?: () => HTMLElement | null
  // Shown only.
  title: string
  op: GatewayOp
  // The parsed input the API bound the confirmation id to; the dialog previews it.
  input: unknown
}

export interface Confirmation extends ConfirmationRequest {
  id: number
  // The first answer wins; a double click or the deadline after it does nothing.
  answer(result: ConfirmationAnswer): void
  // Only explicit user declines count toward the temporary widget block.
  decline(): void
}

export const DECLINES_BEFORE_BLOCK = 3
export const BLOCK_MS = 5 * 60_000

const widgetDeclines = new Map<string, { declines: number; blockedUntil: number }>()
let nextId = 0

/** Waiting confirmations, oldest first; ConfirmDialog shows the head. */
export const confirmations = ref<Confirmation[]>([])

/**
 * Asks the user in the host dialog. The deadline counts from the request, shown or still queued, so an
 * approval always reaches the API before the id expires (CONFIRMATION_TTL_MS).
 */
export function requestConfirmation(request: ConfirmationRequest): Promise<ConfirmationAnswer> {
  const state = widgetDeclines.get(request.widgetId)
  if (state && state.blockedUntil > Date.now()) return Promise.resolve('declined')
  if (state?.blockedUntil) widgetDeclines.delete(request.widgetId)
  return new Promise((resolve) => {
    const id = nextId++
    let settled = false
    const answer = (result: ConfirmationAnswer) => {
      if (settled) return
      settled = true
      if (result === 'approved') widgetDeclines.delete(request.widgetId)
      clearTimeout(timer)
      confirmations.value = confirmations.value.filter((item) => item.id !== id)
      resolve(result)
    }
    const decline = () => {
      if (settled) return
      const state = widgetDeclines.get(request.widgetId) ?? { declines: 0, blockedUntil: 0 }
      state.declines++
      if (state.declines === DECLINES_BEFORE_BLOCK) {
        state.blockedUntil = Date.now() + BLOCK_MS
        showToast({ source: request.title, title: `Widget «${request.title}» requests are blocked for 5 minutes`, body: '' })
      }
      widgetDeclines.set(request.widgetId, state)
      answer('declined')
    }
    const timer = setTimeout(() => answer('expired'), CONFIRMATION_DIALOG_MS)
    confirmations.value = [...confirmations.value, { ...request, id, answer, decline }]
  })
}

/** Widget teardown and unmount: its entries leave the queue declined. */
export function cancelConfirmations(widgetId: string): void {
  for (const item of confirmations.value.filter((entry) => entry.widgetId === widgetId)) item.answer('declined')
}

/** Surface teardown leaves other surfaces of the widget queued. */
export function cancelSurfaceConfirmations(ownerId: string): void {
  for (const item of confirmations.value.filter((entry) => entry.ownerId === ownerId)) item.answer('declined')
}
