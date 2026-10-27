import * as Vue from 'vue'
import { describe, expect, it } from 'vitest'
import { askDelete, pendingDelete } from '../app/spaces/confirm-delete'
import { compileSfc, mountComponent } from './helpers/sfc-renderer'

describe('askDelete', () => {
  it('exposes the request until the user answers it', async () => {
    const asked = askDelete('x')
    expect(pendingDelete.value?.message).toBe('x')
    pendingDelete.value?.answer(true)
    expect(await asked).toBe(true)
    expect(pendingDelete.value).toBeNull()
  })

  it('resolves a pending request with false when a second one arrives', async () => {
    const first = askDelete('a')
    const second = askDelete('b')
    expect(await first).toBe(false)
    expect(pendingDelete.value?.message).toBe('b')
    pendingDelete.value?.answer(true)
    expect(await second).toBe(true)
  })

  it('ignores a late answer to a request that was already settled', async () => {
    const first = askDelete('a')
    const stale = pendingDelete.value
    stale?.answer(false)
    expect(await first).toBe(false)
    const second = askDelete('b')
    stale?.answer(true)
    expect(pendingDelete.value?.message).toBe('b')
    pendingDelete.value?.answer(false)
    expect(await second).toBe(false)
  })

  it('carries the button labels a request names, none by default', () => {
    void askDelete('Reset?', { confirm: 'Reset', cancel: 'Cancel' })
    expect(pendingDelete.value?.labels).toEqual({ confirm: 'Reset', cancel: 'Cancel' })
    pendingDelete.value?.answer(false)
    void askDelete('Delete?')
    expect(pendingDelete.value?.labels).toBeUndefined()
    pendingDelete.value?.answer(false)
  })
})

describe('ConfirmDelete', () => {
  const component = compileSfc(new URL('../app/spaces/ConfirmDelete.vue', import.meta.url), { './confirm-delete': { pendingDelete } })

  it.each([
    [undefined, ['Cancel', 'Delete']],
    [{ confirm: 'Reset', cancel: 'Cancel' }, ['Cancel', 'Reset']],
  ])('labels its buttons %o', async (labels, expected) => {
    const ui = mountComponent(component, {}, [])
    const asked = askDelete('Sure?', labels)
    await Vue.nextTick()
    expect(ui.nodes().filter((el) => el.tag === 'button').map((el) => el.text)).toEqual(expected)
    ui.button(expected[1]!).props.onClick()
    expect(await asked).toBe(true)
  })
})
