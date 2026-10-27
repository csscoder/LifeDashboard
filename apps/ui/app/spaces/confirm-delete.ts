import { shallowRef } from 'vue'

export interface ConfirmLabels {
  confirm: string
  cancel: string
}

export interface PendingDelete {
  message: string
  // Button texts; the dialog falls back to the screen-delete ones.
  labels?: ConfirmLabels
  answer(ok: boolean): void
}

/** The delete request ConfirmDelete.vue shows; null when none is waiting. Shallow, so the entry keeps its identity. */
export const pendingDelete = shallowRef<PendingDelete | null>(null)

/** Asks before a screen delete or a widget reset. A request that arrives while another waits settles that one with false. */
export function askDelete(message: string, labels?: ConfirmLabels): Promise<boolean> {
  pendingDelete.value?.answer(false)
  return new Promise((resolve) => {
    let settled = false
    const entry: PendingDelete = {
      message,
      ...(labels ? { labels } : {}),
      answer(ok) {
        if (settled) return
        settled = true
        if (pendingDelete.value === entry) pendingDelete.value = null
        resolve(ok)
      },
    }
    pendingDelete.value = entry
  })
}
